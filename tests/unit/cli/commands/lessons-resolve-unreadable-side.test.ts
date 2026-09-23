/**
 * One branch committed lessons.json that is not valid JSON. `lessons resolve`
 * cannot combine the index stages, so it must name the broken side, tell the
 * user to fix it in the file, and succeed from the fixed conflict markers on
 * the next run (before `git add`, while git still holds the broken stage).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsResolveData } from '../../../../src/cli/commands/lessons-types.js';
import { lessonsGraphProblem } from '../../../../src/lessons/graph-problem.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import {
  driverDidNotRun,
  isolateGit,
  LESSONS_GRAPH,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../../helpers/lessons-merge-repo.js';

const FIX_IN_FILE =
  `Fix it in ${LESSONS_GRAPH} (its conflict markers hold both sides), then run ` +
  '`agentsmesh lessons resolve` again.';

let repo: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-resolve-unreadable-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

async function resolve(): Promise<{ exitCode: number; data: LessonsResolveData; error?: string }> {
  const r = await runLessons({}, ['resolve'], repo);
  if (r.subcommand !== 'resolve') throw new Error(`expected resolve, got ${r.subcommand}`);
  return r;
}

const graphPath = (): string => join(repo, LESSONS_GRAPH);
const rules = (): string[] =>
  Object.values((JSON.parse(readFileSync(graphPath(), 'utf8')) as LessonsGraph).lessons)
    .map((l) => l.rule)
    .sort();

/** The incoming branch adds lesson `b` and a trailing comma that breaks the JSON. */
function mergeBrokenIncoming(): void {
  const theirs = TWO_CAPTURES.theirs.replace('"version": 2\n', '"version": 2,\n');
  expect(mergeLessonsBranches(repo, repo, { ...TWO_CAPTURES, theirs })).not.toBe(0);
}

describe('lessons resolve — a side that is not valid JSON', () => {
  it('names the broken side, then resolves from the markers once it is fixed in the file', async () => {
    mergeBrokenIncoming();
    const conflicted = readFileSync(graphPath(), 'utf8');
    expect(conflicted).toMatch(/^<{7} /m);

    const first = await resolve();
    expect(first.exitCode).toBe(1);
    expect(first.error).toMatch(
      /^Cannot resolve: \.agentsmesh\/lessons\/lessons\.json on the incoming branch is not a valid lessons graph \(/,
    );
    expect(first.error?.endsWith(FIX_IN_FILE)).toBe(true);
    expect(readFileSync(graphPath(), 'utf8')).toBe(conflicted);

    writeFileSync(graphPath(), conflicted.replace('"version": 2,\n', '"version": 2\n'));
    const second = await resolve();
    expect(second.error).toBeUndefined();
    expect(second.exitCode).toBe(0);
    expect(second.data).toEqual({
      source: 'markers',
      path: LESSONS_GRAPH,
      lessonCount: 3,
      onlyOurs: 1,
      onlyTheirs: 1,
      introduced: [],
      // Default conflict style: the markers carry no base.
      baseKnown: false,
      nextStep: 'merge',
    });
    expect(rules()).toEqual(['Base.', 'Ours A.', 'Theirs B.']);
    expect(lessonsGraphProblem(repo)).toBeNull();
  });

  it('says to fix that side by hand when the file has no conflict markers', async () => {
    mergeBrokenIncoming();
    driverDidNotRun(repo, repo);
    const r = await resolve();
    expect(r.exitCode).toBe(1);
    expect(
      r.error?.endsWith(' Fix that side by hand, keeping the lessons from both branches.'),
    ).toBe(true);
  });
});
