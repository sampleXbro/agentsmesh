/**
 * One resolver for the CLI, the hook and the MCP server: nearest lessons
 * folder, else nearest agentsmesh.yaml, else the git top level, else the start
 * folder. Every walk stops at the first folder with a `.git` entry (a folder or
 * a file), so a nested worktree or submodule never reads its parent's lessons.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findLessonsProjectRoot,
  findLessonsRoot,
  resolveLessonsRoot,
} from '../../../src/lessons/paths.js';

const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: (): string => fakeHome.dir };
});

let base: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'amesh-lroot-git-')));
  fakeHome.dir = join(base, 'home');
  mkdirSync(fakeHome.dir, { recursive: true });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

function dir(...parts: string[]): string {
  const path = join(base, ...parts);
  mkdirSync(path, { recursive: true });
  return path;
}

function gitDir(at: string): string {
  mkdirSync(join(at, '.git'), { recursive: true });
  return at;
}

function gitFile(at: string): string {
  writeFileSync(join(at, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
  return at;
}

function lessonsAt(at: string): string {
  mkdirSync(join(at, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(join(at, '.agentsmesh', 'lessons', 'lessons.json'), '{}');
  return at;
}

function configAt(at: string): string {
  writeFileSync(join(at, 'agentsmesh.yaml'), 'version: 1\n');
  return at;
}

describe('git top level is the fallback root', () => {
  it('resolves a package of a bare git repo to the repository root', () => {
    const repo = gitDir(dir('repo'));
    const web = dir('repo', 'packages', 'web');
    expect(resolveLessonsRoot(web)).toBe(repo);
    expect(findLessonsProjectRoot(web)).toBe(repo);
    expect(findLessonsRoot(web)).toBeNull();
  });

  it('resolves to the nearest agentsmesh.yaml folder when there are no lessons', () => {
    gitDir(dir('repo'));
    const app = configAt(dir('repo', 'packages', 'app'));
    const src = dir('repo', 'packages', 'app', 'src');
    expect(resolveLessonsRoot(src)).toBe(app);
    expect(findLessonsProjectRoot(src)).toBe(app);
  });

  it('uses a git file (worktree, submodule) as the repository root too', () => {
    const wt = gitFile(dir('wt'));
    const src = dir('wt', 'src');
    expect(resolveLessonsRoot(src)).toBe(wt);
    expect(findLessonsProjectRoot(src)).toBe(wt);
  });

  it('falls back to the start folder outside any git repo and project', () => {
    const plain = dir('plain', 'a');
    expect(resolveLessonsRoot(plain)).toBe(plain);
    expect(findLessonsProjectRoot(plain)).toBeNull();
  });

  it('never picks a git repository at the home folder', () => {
    gitDir(fakeHome.dir);
    const notes = dir('home', 'notes');
    expect(resolveLessonsRoot(notes)).toBe(notes);
    expect(findLessonsProjectRoot(notes)).toBeNull();
  });
});

describe('nearest lessons folder wins', () => {
  it('finds lessons at the git root itself, the last folder checked', () => {
    const repo = lessonsAt(gitDir(dir('repo')));
    const web = dir('repo', 'packages', 'web');
    expect(findLessonsRoot(web)).toBe(repo);
    expect(resolveLessonsRoot(web)).toBe(repo);
    expect(findLessonsProjectRoot(web)).toBe(repo);
  });

  it('prefers a package with its own lessons over the repository lessons', () => {
    lessonsAt(gitDir(dir('repo')));
    const web = lessonsAt(dir('repo', 'packages', 'web'));
    const src = dir('repo', 'packages', 'web', 'src');
    expect(findLessonsRoot(src)).toBe(web);
    expect(resolveLessonsRoot(src)).toBe(web);
    expect(findLessonsProjectRoot(src)).toBe(web);
  });

  it('prefers repository lessons over a nearer agentsmesh.yaml inside the repository', () => {
    const repo = lessonsAt(gitDir(dir('repo')));
    configAt(dir('repo', 'packages', 'app'));
    const src = dir('repo', 'packages', 'app', 'src');
    expect(resolveLessonsRoot(src)).toBe(repo);
    expect(findLessonsProjectRoot(src)).toBe(repo);
  });
});

describe('every walk stops at the first .git entry', () => {
  it('does not climb from a nested worktree into the parent checkout lessons', () => {
    lessonsAt(gitDir(dir('checkout')));
    const wt = gitFile(dir('checkout', '.claude', 'worktrees', 'x'));
    const src = dir('checkout', '.claude', 'worktrees', 'x', 'src');
    expect(findLessonsRoot(src)).toBeNull();
    expect(findLessonsRoot(wt)).toBeNull();
    expect(resolveLessonsRoot(src)).toBe(wt);
    expect(findLessonsProjectRoot(src)).toBe(wt);
  });

  it('does not climb from a submodule (git file) either', () => {
    lessonsAt(gitDir(dir('super')));
    const sub = gitFile(dir('super', 'vendor', 'lib'));
    expect(findLessonsRoot(sub)).toBeNull();
    expect(resolveLessonsRoot(dir('super', 'vendor', 'lib', 'src'))).toBe(sub);
  });

  it('does not climb from a nested git repo into a parent git repo', () => {
    lessonsAt(gitDir(dir('outer')));
    const inner = gitDir(dir('outer', 'inner'));
    expect(findLessonsRoot(inner)).toBeNull();
    expect(findLessonsProjectRoot(dir('outer', 'inner', 'src'))).toBe(inner);
  });

  it('uses the lessons of the worktree itself when it has its own', () => {
    lessonsAt(gitDir(dir('checkout')));
    const wt = lessonsAt(gitFile(dir('checkout', '.claude', 'worktrees', 'x')));
    const src = dir('checkout', '.claude', 'worktrees', 'x', 'src');
    expect(findLessonsRoot(src)).toBe(wt);
    expect(resolveLessonsRoot(src)).toBe(wt);
  });

  it('ignores an agentsmesh.yaml above the git root', () => {
    configAt(dir('outer'));
    const repo = gitDir(dir('outer', 'repo'));
    const src = dir('outer', 'repo', 'src');
    expect(resolveLessonsRoot(src)).toBe(repo);
    expect(findLessonsProjectRoot(src)).toBe(repo);
  });

  it('counts an agentsmesh.yaml at the git root itself', () => {
    const repo = configAt(gitDir(dir('repo')));
    const src = dir('repo', 'src');
    expect(resolveLessonsRoot(src)).toBe(repo);
    expect(findLessonsProjectRoot(src)).toBe(repo);
  });

  it('keeps the nearest config over the git root when both are in the repository', () => {
    configAt(gitDir(dir('repo')));
    const app = configAt(dir('repo', 'packages', 'app'));
    expect(resolveLessonsRoot(dir('repo', 'packages', 'app', 'src'))).toBe(app);
  });
});
