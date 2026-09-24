/**
 * `lessons resolve` edge cases: counts taken after same-id lessons are renamed,
 * the next git step named for the operation in progress, and the conflict
 * marker fallback — which cannot see what one branch deleted without a diff3
 * base, and must not save a result with errors (the markers are the only record
 * of both branches).
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsResolveData } from '../../../../src/cli/commands/lessons-types.js';
import type { Lesson, LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { serializeGraph } from '../../../../src/lessons/graph-store.js';
import { lesson } from '../../../helpers/lessons-graph-fixture.js';
import {
  clearEnv,
  commitAll,
  git,
  GIT_HOOK_ENV,
  initRepo,
  tryGit,
  writeFile,
} from '../../../helpers/temp-git-repo.js';

const GRAPH = '.agentsmesh/lessons/lessons.json';
let repo: string;
type Triggers = LessonsGraph['triggers'];
const graph = (lessons: Record<string, Lesson>, triggers: Triggers = {}): string =>
  serializeGraph({ version: 2, lessons, topics: { t: { summary: 'T.' } }, triggers });

/** Base, then `theirs` on branch feature and `ours` on main; returns git's exit status. */
function diverge(
  base: string,
  ours: string,
  theirs: string,
  op: string[],
  style = 'merge',
): number {
  initRepo(repo);
  git(repo, ['config', 'merge.conflictStyle', style]);
  writeFile(repo, GRAPH, base);
  commitAll(repo, 'base');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  writeFile(repo, GRAPH, theirs);
  commitAll(repo, 'theirs');
  git(repo, ['checkout', '-q', 'main']);
  writeFile(repo, GRAPH, ours);
  commitAll(repo, 'ours');
  return tryGit(repo, op).status ?? 0;
}

const addTwoLessons = (op: string[], style?: string): number =>
  diverge(
    graph({ l0: lesson('Base.') }),
    graph({ a: lesson('Ours A.'), l0: lesson('Base.') }),
    graph({ b: lesson('Theirs B.'), l0: lesson('Base.') }),
    op,
    style,
  );

async function resolve(): Promise<{ exitCode: number; data: LessonsResolveData; error?: string }> {
  const r = await runLessons({}, ['resolve'], repo);
  if (r.subcommand !== 'resolve') throw new Error(`expected resolve, got ${r.subcommand}`);
  return r;
}

let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = clearEnv(GIT_HOOK_ENV);
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-resolve-cases-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('lessons resolve — summary and next step', () => {
  it('counts a rule both branches edited as one lesson on each side, after the rename', async () => {
    expect(
      diverge(
        graph({ l0: lesson('Base.') }),
        graph({ l0: lesson('Ours rule.') }),
        graph({ l0: lesson('Theirs rule.') }),
        ['merge', '--no-edit', 'feature'],
      ),
    ).not.toBe(0);
    const r = await resolve();
    expect([r.data.lessonCount, r.data.onlyOurs, r.data.onlyTheirs]).toEqual([2, 1, 1]);
  });

  it('names the merge as the operation to finish', async () => {
    expect(addTwoLessons(['merge', '--no-edit', 'feature'])).not.toBe(0);
    expect((await resolve()).data.nextStep).toBe('merge');
  });

  it('names a cherry-pick as the operation to finish', async () => {
    expect(addTwoLessons(['cherry-pick', 'feature'])).not.toBe(0);
    expect((await resolve()).data.nextStep).toBe('cherry-pick');
  });
});

describe('lessons resolve — from committed conflict markers', () => {
  const commitMarkers = (): void => commitAll(repo, 'committed markers');

  it('warns that a deletion may come back when the markers have no diff3 base', async () => {
    expect(addTwoLessons(['merge', '--no-edit', 'feature'])).not.toBe(0);
    commitMarkers();
    const r = await resolve();
    expect([r.exitCode, r.data.source, r.data.baseKnown, r.data.nextStep]).toEqual([
      0,
      'markers',
      false,
      'none',
    ]);
  });

  it('knows the base when the markers carry one (diff3)', async () => {
    expect(addTwoLessons(['merge', '--no-edit', 'feature'], 'diff3')).not.toBe(0);
    commitMarkers();
    expect((await resolve()).data.baseKnown).toBe(true);
  });

  it('refuses to save a result with errors, and keeps the markers', async () => {
    const withTrigger = (id: string, rule: string, trigger: string): string =>
      graph(
        { [id]: { ...lesson(rule), triggers: [trigger] }, l0: lesson('Base.') },
        { [trigger]: { kind: 'file_glob', pattern: 'src/x.ts' } },
      );
    expect(
      diverge(
        graph({ l0: lesson('Base.') }),
        withTrigger('a', 'Ours A.', 'p'),
        withTrigger('b', 'Theirs B.', 'q'),
        ['merge', '--no-edit', 'feature'],
      ),
    ).not.toBe(0);
    commitMarkers();
    const before = readFileSync(join(repo, GRAPH), 'utf8');
    const r = await resolve();
    expect(r.exitCode).toBe(1);
    expect(r.error).toBe(
      'Cannot resolve from the conflict markers: combining the two sides rebuilt from them ' +
        'gives errors (DUPLICATE_TRIGGER), and the markers mix both branches, so the result ' +
        `cannot be trusted. Fix ${GRAPH} by hand, keeping the lessons from both branches, then ` +
        'run `agentsmesh lessons validate`.',
    );
    expect(readFileSync(join(repo, GRAPH), 'utf8')).toBe(before);
  });
});
