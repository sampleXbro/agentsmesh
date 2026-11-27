/**
 * The fallback line merge must keep the common ancestor in its markers, so
 * `lessons resolve` can run a real three-way merge from them later. Without a
 * base, a rule one branch reworded looks like two different lessons.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { splitConflictSides } from '../../../src/lessons/conflict-markers.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { graphFilePath, serializeGraph } from '../../../src/lessons/graph-store.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import { writeTextualMerge } from '../../../src/lessons/textual-merge.js';
import { lesson } from '../../helpers/lessons-graph-fixture.js';
import { writeGraphText } from '../../helpers/lessons-graph-fixture.js';

let dir: string;
const p = (name: string): string => join(dir, name);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-textual-diff3-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const graphWith = (over: { rule?: string; evidence?: string[] }): string =>
  serializeGraph({
    version: 2,
    lessons: { l0: { ...lesson(over.rule ?? 'Base.'), evidence: over.evidence ?? [] } },
    topics: { t: { summary: 'T.' } },
    triggers: {},
  } as LessonsGraph);

/** This branch rewords the rule; the incoming branch adds evidence on the next line. */
function writeRewordVersusEvidence(): void {
  writeFileSync(p('base'), graphWith({}));
  writeFileSync(p('ours'), graphWith({ rule: 'Reworded.' }));
  writeFileSync(p('theirs'), graphWith({ evidence: ['ev1'] }));
  writeTextualMerge(p('base'), p('ours'), p('theirs'));
}

describe('writeTextualMerge — diff3 markers', () => {
  it('writes the common ancestor between the two sides of a conflict', () => {
    writeRewordVersusEvidence();
    const text = readFileSync(p('ours'), 'utf8');
    expect(text.split('\n').filter((l) => /^[<|=>]{7}/.test(l))).toEqual([
      '<<<<<<< this branch',
      '||||||| common ancestor',
      '=======',
      '>>>>>>> incoming branch',
    ]);
  });

  it('lets the marker parser rebuild the base, ours and theirs files', () => {
    writeRewordVersusEvidence();
    const sides = splitConflictSides(readFileSync(p('ours'), 'utf8'));
    expect(sides?.base).toContain('"rule": "Base."');
    expect(sides?.ours).toContain('"rule": "Reworded."');
    expect(sides?.theirs).toContain('"ev1"');
  });
});

describe('lessons resolve — from the fallback markers', () => {
  it('keeps one lesson with both edits instead of splitting it in two', async () => {
    writeRewordVersusEvidence();
    writeGraphText(dir, readFileSync(p('ours'), 'utf8'));

    const outcome = await resolveLessonsConflict(dir);
    expect(outcome.ok && outcome.resolved.baseKnown).toBe(true);
    const saved = JSON.parse(readFileSync(graphFilePath(dir), 'utf8')) as LessonsGraph;
    expect(Object.keys(saved.lessons)).toEqual(['l0']);
    expect(saved.lessons.l0).toMatchObject({ rule: 'Reworded.', evidence: ['ev1'] });
  });
});
