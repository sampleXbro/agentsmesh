/**
 * In a git repo with no lessons setup, `lessons add` from a package saves at
 * the repository root, where `lessons query` from anywhere in the repo (and the
 * MCP tools) finds it, instead of splitting the store into the package.
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { lessonsPaths } from '../../../../src/lessons/paths.js';

const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: (): string => fakeHome.dir };
});

let base: string;
let repo: string;
let web: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'amesh-cli-git-root-')));
  fakeHome.dir = join(base, 'home');
  repo = join(base, 'repo');
  web = join(repo, 'packages', 'web');
  mkdirSync(fakeHome.dir, { recursive: true });
  mkdirSync(join(repo, '.git'), { recursive: true });
  mkdirSync(web, { recursive: true });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const ADD = {
  topic: 'web',
  'new-topic': true,
  'topic-summary': 'Web.',
  'trigger-file': 'packages/web/vite.config.ts',
};

describe('lessons CLI in a git repo with no lessons setup', () => {
  it('add from a package saves at the repository root, not in the package', async () => {
    const r = await runLessons(ADD, ['add', 'Keep the vite config small.'], web);
    expect(r.exitCode).toBe(0);
    expect(existsSync(lessonsPaths(repo).graph)).toBe(true);
    expect(existsSync(join(web, '.agentsmesh'))).toBe(false);
    expect(existsSync(join(web, '.gitignore'))).toBe(false);
  });

  it('query from the repository root finds what a package add saved', async () => {
    await runLessons(ADD, ['add', 'Keep the vite config small.'], web);
    const r = await runLessons(
      { file: 'packages/web/vite.config.ts', session: 'auto' },
      ['query'],
      repo,
    );
    expect(r.exitCode).toBe(0);
    expect(JSON.stringify(r.data)).toContain('Keep the vite config small.');
  });

  it('add from a nested worktree saves in the worktree, not the parent checkout', async () => {
    const worktree = join(repo, '.claude', 'worktrees', 'x');
    mkdirSync(join(worktree, 'src'), { recursive: true });
    writeFileSync(join(worktree, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
    const r = await runLessons(ADD, ['add', 'Keep the vite config small.'], join(worktree, 'src'));
    expect(r.exitCode).toBe(0);
    expect(existsSync(lessonsPaths(worktree).graph)).toBe(true);
    expect(existsSync(lessonsPaths(repo).graph)).toBe(false);
  });

  it('add from a folder outside any git repo still saves in that folder', async () => {
    const plain = join(base, 'plain', 'a');
    mkdirSync(plain, { recursive: true });
    const r = await runLessons(ADD, ['add', 'A rule.'], plain);
    expect(r.exitCode).toBe(0);
    expect(existsSync(lessonsPaths(plain).graph)).toBe(true);
  });
});
