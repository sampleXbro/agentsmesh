/**
 * git keeps symlinks, so a cloned repo can link `.agentsmesh/lessons` (or
 * `.agentsmesh`) outside the project. Lesson writes (add, graph save, lock,
 * init --lessons) refuse such a folder with a clear error, and the logs skip
 * it silently so the recall hook never breaks (GHSA-87c3-4xm5-xvpm).
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLesson } from '../../../src/lessons/add.js';
import {
  appendCaptureRecord,
  type CaptureTelemetryRecord,
} from '../../../src/lessons/capture-telemetry.js';
import { emptyGraph } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { scaffoldLessons } from '../../../src/lessons/init.js';
import { appendOutcomeEvent } from '../../../src/lessons/outcome-log.js';
import { appendRecallRecord, type RecallTelemetryRecord } from '../../../src/lessons/telemetry.js';

const OUTSIDE = { code: 'LESSONS_DIR_OUTSIDE_PROJECT' };
const ON: NodeJS.ProcessEnv = { AGENTSMESH_LESSONS_TELEMETRY: '1' };
const INPUT = {
  rule: 'Keep lessons inside the project.',
  topic: 'safety',
  triggers: { keywords: ['containment'] },
};
const add = (): ReturnType<typeof addLesson> =>
  addLesson(proj, INPUT, { allowNewTopic: true, topicSummary: 'Safety.' });

let base: string;
let proj: string;
let outside: string;

// 'junction' makes directory links work on Windows without admin rights.
const link = (target: string, path: string): void => symlinkSync(target, path, 'junction');

/** Every file under `dir` with its content, so a test can prove nothing changed. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    files[relative(dir, abs).replaceAll('\\', '/')] = readFileSync(abs, 'utf8');
  }
  return files;
}

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-lessons-contain-')));
  proj = join(base, 'proj');
  outside = join(base, 'outside');
  mkdirSync(join(proj, '.agentsmesh'), { recursive: true });
  writeFileSync(join(proj, 'agentsmesh.yaml'), 'version: 1\ntargets: [claude-code]\n');
  mkdirSync(join(outside, 'lessons'), { recursive: true });
  writeFileSync(join(outside, 'lessons', 'keep.txt'), 'not yours\n');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('.agentsmesh/lessons linked outside the project', () => {
  beforeEach(() => link(join(outside, 'lessons'), join(proj, '.agentsmesh', 'lessons')));

  it('addLesson refuses and writes nothing there (no graph, lock or log)', async () => {
    await expect(add()).rejects.toMatchObject(OUTSIDE);
    expect(snapshot(outside)).toEqual({ 'lessons/keep.txt': 'not yours\n' });
  });

  it('a direct graph save refuses too', () => {
    expect(() => saveLessonsGraph(proj, emptyGraph())).toThrow(
      expect.objectContaining({
        ...OUTSIDE,
        message: expect.stringMatching(/outside the project/),
      }),
    );
  });

  it('init --lessons refuses', async () => {
    await expect(scaffoldLessons(proj)).rejects.toMatchObject(OUTSIDE);
    expect(snapshot(outside)).toEqual({ 'lessons/keep.txt': 'not yours\n' });
  });

  it('the capture, recall and outcome logs skip it without throwing', () => {
    const capture: CaptureTelemetryRecord = {
      ts: '2026-09-24T00:00:00.000Z',
      isNewLesson: true,
      isNewTopic: false,
      newTriggerCount: 1,
      triggerKinds: { file: 1, command: 0, keyword: 0 },
      blocked: false,
      warningCodes: [],
    };
    const recall: RecallTelemetryRecord = {
      ts: '2026-09-24T00:00:00.000Z',
      hasFile: true,
      hasCommand: false,
      hasKeyword: false,
      totalMatches: 1,
      returnedCount: 1,
      returnedTokens: 10,
      truncated: false,
      matchedByKind: { file: 1, command: 0, keyword: 0 },
    };
    appendCaptureRecord(proj, capture, ON);
    appendRecallRecord(proj, recall, ON);
    appendOutcomeEvent(
      proj,
      { ts: '2026-09-24T00:00:00Z', kind: 'delivered', lessonId: 'l', contextKey: 'k' },
      ON,
    );
    expect(snapshot(outside)).toEqual({ 'lessons/keep.txt': 'not yours\n' });
  });
});

describe('other links', () => {
  it('refuses when .agentsmesh itself is linked outside', async () => {
    rmSync(join(proj, '.agentsmesh'), { recursive: true });
    link(outside, join(proj, '.agentsmesh'));

    await expect(add()).rejects.toMatchObject(OUTSIDE);
    expect(snapshot(outside)).toEqual({ 'lessons/keep.txt': 'not yours\n' });
  });

  it('refuses a dangling link and does not create its target', async () => {
    link(join(outside, 'missing'), join(proj, '.agentsmesh', 'lessons'));

    await expect(add()).rejects.toMatchObject(OUTSIDE);
    expect(existsSync(join(outside, 'missing'))).toBe(false);
  });

  it('allows a link to a folder inside the project', async () => {
    mkdirSync(join(proj, 'shared-lessons'));
    link(join(proj, 'shared-lessons'), join(proj, '.agentsmesh', 'lessons'));

    await expect(add()).resolves.toMatchObject({ isNewLesson: true });
    expect(existsSync(join(proj, 'shared-lessons', 'lessons.json'))).toBe(true);
  });
});
