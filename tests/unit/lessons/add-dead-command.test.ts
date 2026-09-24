import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLesson, UnrecallableLessonError } from '../../../src/lessons/add.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../src/lessons/graph-store.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-add-dead-cmd-'));
  saveLessonsGraph(root, {
    version: 2,
    lessons: {},
    topics: { t: { summary: 'T.' } },
    triggers: {},
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const LOOKBEHIND = '(?<=a)b';
const UNCLOSED = '[';

describe('addLesson — a dead --trigger-cmd next to a live trigger', () => {
  it.each([
    [LOOKBEHIND, 'outside the provably-linear engine'],
    [UNCLOSED, 'invalid regex'],
  ])('drops %j with a warning naming it and why', async (pattern, why) => {
    const r = await addLesson(root, {
      rule: 'R.',
      topic: 't',
      triggers: { files: ['src/index.ts'], commands: [pattern] },
    });
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.id]?.triggers).toEqual(r.newTriggerIds);
    expect(r.newTriggerIds).toHaveLength(1);
    expect(Object.values(graph.triggers)).toEqual([{ kind: 'file_glob', pattern: 'src/index.ts' }]);
    const dead = r.warnings.filter((w) => w.code === 'DEAD_COMMAND_PATTERN');
    expect(dead).toHaveLength(1);
    expect(dead[0]!.message).toContain(JSON.stringify(pattern));
    expect(dead[0]!.message).toContain(why);
  });

  it('drops it on an upsert and reports no other change', async () => {
    await addLesson(root, { rule: 'R.', topic: 't', triggers: { files: ['src/index.ts'] } });
    const r = await addLesson(root, {
      rule: 'R.',
      topic: 't',
      triggers: { commands: [LOOKBEHIND] },
    });
    expect(r.isNewLesson).toBe(false);
    expect(r.changes).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('DEAD_COMMAND_PATTERN');
    expect(Object.keys(loadLessonsGraph(root).triggers)).toHaveLength(1);
  });

  it('drops it from an always-on lesson without rejecting the capture', async () => {
    const r = await addLesson(root, {
      rule: 'Always R.',
      topic: 't',
      triggers: { commands: [UNCLOSED] },
      scope: 'always',
    });
    expect(loadLessonsGraph(root).lessons[r.id]?.triggers).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('DEAD_COMMAND_PATTERN');
  });
});

describe('addLesson — every trigger is a dead --trigger-cmd', () => {
  it.each([[LOOKBEHIND], [UNCLOSED], [LOOKBEHIND, UNCLOSED]])(
    'rejects %j as UNRECALLABLE_LESSON and writes nothing',
    async (...commands) => {
      const before = readFileSync(graphFilePath(root), 'utf8');
      const err = await addLesson(root, { rule: 'R.', topic: 't', triggers: { commands } }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(UnrecallableLessonError);
      const dead = (err as UnrecallableLessonError).deadTriggers.map((t) => t.pattern);
      expect(dead).toEqual(commands);
      expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
    },
  );
});
