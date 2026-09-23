/**
 * Two teammates each capture a different lesson on their own branch, then merge.
 * Runs the real CLI from source (tsx) in a throwaway git repo:
 *  - without the per-clone driver config (a fresh clone) git line-merges
 *    lessons.json into conflict markers, and `lessons resolve` must recover both;
 *  - with the config written by `ensureLessonsMergeDriver` the merge is clean.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureLessonsMergeDriver } from '../../src/lessons/merge-driver-setup.js';
import { clearEnv, GIT_HOOK_ENV } from '../helpers/temp-git-repo.js';

const REPO = process.cwd();
const TSX_CLI = join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SRC_CLI = join(REPO, 'src', 'cli', 'index.ts');
const GRAPH = '.agentsmesh/lessons/lessons.json';
// Hook-exported git vars would aim git at another repo; host config could hold a driver.
let restoreEnv: () => void = () => {};

let dir: string;

interface Run {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(cmd: string, args: readonly string[]): Run {
  const r = spawnSync(cmd, [...args], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@e.st',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@e.st',
    },
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const git = (...args: string[]): Run => run('git', ['-c', 'commit.gpgsign=false', ...args]);
const cli = (...args: string[]): Run => run(process.execPath, [TSX_CLI, SRC_CLI, ...args]);

function capture(branch: string, rule: string, topic: string): void {
  git('checkout', '-q', '-b', branch, 'main');
  const add = cli(
    'lessons',
    'add',
    rule,
    '--topic',
    topic,
    '--new-topic',
    '--topic-summary',
    `${topic}.`,
    '--trigger-file',
    `src/${topic}.ts`,
  );
  expect(add.status, add.stderr).toBe(0);
  git('add', '-A');
  expect(git('commit', '-qm', `capture ${topic}`).status).toBe(0);
}

/** Branches x and y each capture one lesson; returns the result of merging y into x. */
function parallelCaptures(): Run {
  capture('x', 'Rule X from teammate one.', 'tx');
  capture('y', 'Rule Y from teammate two.', 'ty');
  git('checkout', '-q', 'x');
  return git('merge', '--no-edit', 'y');
}

const rules = (): string[] =>
  Object.values(
    (
      JSON.parse(readFileSync(join(dir, GRAPH), 'utf8')) as {
        lessons: Record<string, { rule: string }>;
      }
    ).lessons,
  )
    .map((l) => l.rule)
    .sort();

beforeAll(() => {
  restoreEnv = clearEnv([...GIT_HOOK_ENV, 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']);
  process.env.GIT_CONFIG_GLOBAL = join(tmpdir(), 'am-merge-conflict-no-global-gitconfig');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});
afterAll(() => restoreEnv());
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-merge-conflict-'));
  git('init', '-q', '--initial-branch=main');
  const init = cli('init', '--lessons');
  expect(init.status, init.stderr).toBe(0);
  expect(readFileSync(join(dir, '.gitattributes'), 'utf8')).toContain(
    `${GRAPH} merge=agentsmesh-lessons`,
  );
  // init may set the per-clone driver; a fresh clone never has it (it is not cloned).
  git('config', '--local', '--remove-section', 'merge.agentsmesh-lessons');
  git('add', '-A');
  expect(git('commit', '-qm', 'base').status).toBe(0);
}, 60_000);
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('lessons.json merge between two branches', () => {
  it('without the driver config: conflict markers, then `lessons resolve` keeps both lessons', () => {
    const merge = parallelCaptures();
    expect(merge.status).not.toBe(0);
    expect(readFileSync(join(dir, GRAPH), 'utf8')).toMatch(/^<{7} /m);

    const validate = cli('lessons', 'validate', '--json');
    expect(validate.status).toBe(1);
    expect(validate.stdout).toContain('MERGE_CONFLICT');

    const resolve = cli('lessons', 'resolve', '--json');
    expect(resolve.status, resolve.stderr).toBe(0);
    const envelope = JSON.parse(resolve.stdout) as { success: boolean; data: unknown };
    expect(envelope).toEqual({
      success: true,
      command: 'lessons',
      data: {
        source: 'index',
        path: GRAPH,
        lessonCount: 2,
        onlyOurs: 1,
        onlyTheirs: 1,
        introduced: [],
      },
    });
    expect(rules()).toEqual(['Rule X from teammate one.', 'Rule Y from teammate two.']);
    expect(cli('lessons', 'validate').status).toBe(0);

    git('add', GRAPH);
    expect(git('commit', '--no-edit', '-q').status).toBe(0);
    expect(git('ls-files', '-u').stdout).toBe('');
  }, 120_000);

  it('with the driver config from ensureLessonsMergeDriver: merges cleanly', () => {
    const setup = ensureLessonsMergeDriver(dir, { invocation: `node "${TSX_CLI}" "${SRC_CLI}"` });
    expect(setup.status).toBe('configured');

    const merge = parallelCaptures();
    expect(merge.status, `${merge.stdout}\n${merge.stderr}`).toBe(0);
    expect(readFileSync(join(dir, GRAPH), 'utf8')).not.toMatch(/^<{7} /m);
    expect(rules()).toEqual(['Rule X from teammate one.', 'Rule Y from teammate two.']);
  }, 120_000);
});
