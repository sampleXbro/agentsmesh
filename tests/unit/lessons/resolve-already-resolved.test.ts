/**
 * `lessons resolve` rebuilds the graph from git's merge stages. When the file
 * already holds every lesson of that result (it was resolved, then repaired),
 * overwriting it would undo the repair, so it is left alone.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { doResolve } from '../../../src/cli/commands/lessons-resolve-handler.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../src/lessons/graph-store.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import { untriggerLesson } from '../../../src/lessons/untrigger.js';
import {
  driverDidNotRun,
  isolateGit,
  LESSONS_GRAPH,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../helpers/lessons-merge-repo.js';
import { TRIGGERED_CAPTURES } from '../../helpers/lessons-repair-fixture.js';

const BOM = '\uFEFF';
let repo: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-resolve-already-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const fileText = (): string => readFileSync(graphFilePath(repo), 'utf8');
const ruleIds = (): string[] =>
  Object.keys((JSON.parse(fileText()) as LessonsGraph).lessons).sort();

describe('lessons resolve — the file already holds every lesson of the merge', () => {
  it('keeps a repair made after the first resolve, and says it is already resolved', async () => {
    expect(mergeLessonsBranches(repo, repo, TRIGGERED_CAPTURES)).not.toBe(0);
    const first = await resolveLessonsConflict(repo);
    expect(first.ok && first.resolved.alreadyResolved).toBeUndefined();

    const graph = loadLessonsGraph(repo);
    untriggerLesson(graph, 'a', 'g1');
    saveLessonsGraph(repo, graph);
    const repaired = fileText();

    const second = await resolveLessonsConflict(repo);
    expect(second).toEqual({
      ok: true,
      resolved: {
        source: 'index',
        lessonCount: 3,
        onlyOurs: 1,
        onlyTheirs: 1,
        introduced: [],
        baseKnown: true,
        nextStep: 'merge',
        alreadyResolved: true,
      },
    });
    expect(fileText()).toBe(repaired);
  });

  it('does not rewrite a file that is a repaired merge made without any resolve', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    const union = {
      ...JSON.parse(TWO_CAPTURES.ours),
      lessons: {
        ...JSON.parse(TWO_CAPTURES.ours).lessons,
        b: { ...JSON.parse(TWO_CAPTURES.theirs).lessons.b, rule: 'Theirs B, my wording.' },
      },
    };
    writeFileSync(graphFilePath(repo), JSON.stringify(union, null, 2));
    const handMade = fileText();
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok && outcome.resolved.alreadyResolved).toBe(true);
    expect(fileText()).toBe(handMade);
  });

  it('reports it in the command result, with exit 0', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    await resolveLessonsConflict(repo);
    const r = await doResolve(repo);
    expect(r.exitCode).toBe(0);
    expect(r.subcommand === 'resolve' && r.data).toEqual({
      source: 'index',
      path: LESSONS_GRAPH,
      lessonCount: 3,
      onlyOurs: 1,
      onlyTheirs: 1,
      introduced: [],
      baseKnown: true,
      nextStep: 'merge',
      alreadyResolved: true,
    });
  });

  it('still rebuilds the graph when the file lacks a lesson of the merge', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    driverDidNotRun(repo, repo);
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok && outcome.resolved.alreadyResolved).toBeUndefined();
    expect(ruleIds()).toEqual(['a', 'b', 'l0']);
  });

  it('still rebuilds the graph when the file is not a readable graph', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    writeFileSync(graphFilePath(repo), '{ half a file');
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok && outcome.resolved.alreadyResolved).toBeUndefined();
    expect(ruleIds()).toEqual(['a', 'b', 'l0']);
  });
});

describe('lessons resolve — a UTF-8 BOM in the merged files', () => {
  it('combines stages that start with a BOM', async () => {
    const bom = (text: string): string => `${BOM}${text}`;
    const sides = {
      base: bom(TWO_CAPTURES.base),
      ours: bom(TWO_CAPTURES.ours),
      theirs: bom(TWO_CAPTURES.theirs),
    };
    expect(mergeLessonsBranches(repo, repo, sides)).not.toBe(0);
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok).toBe(true);
    expect(ruleIds()).toEqual(['a', 'b', 'l0']);
  });

  it('treats a BOM-prefixed file that holds every lesson as already resolved', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    await resolveLessonsConflict(repo);
    writeFileSync(graphFilePath(repo), `${BOM}${fileText()}`);
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok && outcome.resolved.alreadyResolved).toBe(true);
  });
});
