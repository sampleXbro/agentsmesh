/** `lessons resolve` reads a merge base git holds but it cannot parse as empty, and says so. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { graphFilePath } from '../../../src/lessons/graph-store.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import {
  isolateGit,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../helpers/lessons-merge-repo.js';

let repo: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-resolve-base-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('lessons resolve — a merge base that is not a valid graph', () => {
  it('still combines both sides and reports that the base is not known', async () => {
    expect(mergeLessonsBranches(repo, repo, { ...TWO_CAPTURES, base: '{ not json\n' })).not.toBe(0);
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok && [outcome.resolved.source, outcome.resolved.baseKnown]).toEqual([
      'index',
      false,
    ]);
    const saved = JSON.parse(readFileSync(graphFilePath(repo), 'utf8')) as LessonsGraph;
    expect(Object.keys(saved.lessons).sort()).toEqual(['a', 'b', 'l0']);
  });

  it('knows the base when git holds a readable one', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok && outcome.resolved.baseKnown).toBe(true);
  });
});
