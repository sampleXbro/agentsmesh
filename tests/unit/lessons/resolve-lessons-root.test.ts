/**
 * The hook and the MCP server are started in whatever directory the agent's
 * session is in, which in a monorepo is often a package, not the repository
 * root. Rooting lessons at the start directory made recall silently empty
 * there, and made the MCP server announce that lessons were not set up while
 * its own tools could still find them.
 *
 * The lessons CLI resolves from here too, so a subfolder acts on the project.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync, symlinkSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
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

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'amesh-lroot-')));
  // Never the real home: the walk must not see what lives there.
  fakeHome.dir = join(root, 'home');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function projectAt(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agentsmesh.yaml'), 'version: 1\n');
}

function lessonsAt(dir: string, file: 'lessons.json' | 'config.json'): void {
  mkdirSync(join(dir, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(join(dir, '.agentsmesh', 'lessons', file), '{}');
}

describe('resolveLessonsRoot', () => {
  it('returns the start directory when it holds the graph', () => {
    lessonsAt(root, 'lessons.json');
    expect(resolveLessonsRoot(root)).toBe(root);
  });

  it('walks up from a nested package to the directory holding the graph', () => {
    lessonsAt(root, 'lessons.json');
    const pkg = join(root, 'packages', 'api', 'src');
    mkdirSync(pkg, { recursive: true });
    expect(resolveLessonsRoot(pkg)).toBe(root);
  });

  it('finds a wired project whose graph does not exist yet', () => {
    lessonsAt(root, 'config.json');
    const pkg = join(root, 'packages', 'api');
    mkdirSync(pkg, { recursive: true });
    expect(resolveLessonsRoot(pkg)).toBe(root);
  });

  it('prefers the nearest lessons directory over one further up', () => {
    lessonsAt(root, 'lessons.json');
    const inner = join(root, 'services', 'billing');
    lessonsAt(inner, 'lessons.json');
    expect(resolveLessonsRoot(join(inner, 'src'))).toBe(inner);
  });

  it('falls back to the start directory when no ancestor has lessons', () => {
    const pkg = join(root, 'a', 'b');
    mkdirSync(pkg, { recursive: true });
    expect(resolveLessonsRoot(pkg)).toBe(pkg);
  });

  it('ignores a bare .agentsmesh directory, as the global config lives in one', () => {
    // ~/.agentsmesh holds global config but never a lessons graph, so keying
    // on the bare directory would claim a project exists above every folder
    // under the home directory.
    mkdirSync(join(root, '.agentsmesh'), { recursive: true });
    const pkg = join(root, 'work', 'repo');
    mkdirSync(pkg, { recursive: true });
    expect(resolveLessonsRoot(pkg)).toBe(pkg);
  });

  it('never walks up into the home directory, even when a graph sits there', () => {
    // A graph under ~/.agentsmesh is not a project's memory: recalling it from
    // every folder under the home directory leaks rules across projects.
    lessonsAt(fakeHome.dir, 'lessons.json');
    const plain = join(fakeHome.dir, 'work', 'plain');
    mkdirSync(plain, { recursive: true });
    expect(resolveLessonsRoot(plain)).toBe(plain);
  });

  it.skipIf(platform() === 'win32')(
    'stops at a home reached through a symlink (HOME is a link, the cwd is real)',
    () => {
      // macOS: HOME=/tmp/x/home while the process cwd is /private/tmp/x/home/...
      const realHome = join(root, 'real-home');
      lessonsAt(realHome, 'lessons.json');
      symlinkSync(realHome, join(root, 'home-link'));
      fakeHome.dir = join(root, 'home-link');
      const plain = join(realHome, 'work', 'plain');
      mkdirSync(plain, { recursive: true });
      expect(resolveLessonsRoot(plain)).toBe(plain);
      expect(findLessonsRoot(realHome)).toBeNull();
    },
  );
});

describe('findLessonsRoot', () => {
  it('returns the nearest directory holding lessons', () => {
    lessonsAt(root, 'config.json');
    const pkg = join(root, 'packages', 'api');
    mkdirSync(pkg, { recursive: true });
    expect(findLessonsRoot(pkg)).toBe(root);
  });

  it('returns null when no directory holds lessons', () => {
    expect(findLessonsRoot(root)).toBeNull();
  });

  it('never returns the home directory, even started there with a graph', () => {
    lessonsAt(fakeHome.dir, 'lessons.json');
    lessonsAt(fakeHome.dir, 'config.json');
    expect(findLessonsRoot(fakeHome.dir)).toBeNull();
    expect(findLessonsRoot(join(fakeHome.dir, 'work'))).toBeNull();
  });
});

describe('findLessonsProjectRoot', () => {
  it('prefers the nearest lessons root over a nearer agentsmesh project', () => {
    // Nested: the repo root holds the lessons; a package has its own config.
    lessonsAt(root, 'lessons.json');
    const app = join(root, 'packages', 'app');
    projectAt(app);
    expect(findLessonsProjectRoot(join(app, 'src'))).toBe(root);
  });

  it('falls back to the nearest agentsmesh project when no lessons exist', () => {
    const proj = join(fakeHome.dir, 'work', 'proj');
    projectAt(proj);
    const sub = join(proj, 'src');
    mkdirSync(sub, { recursive: true });
    expect(findLessonsProjectRoot(sub)).toBe(proj);
  });

  it('falls back to the git work tree root, so plugin-only capture works in any repo', () => {
    const repo = join(fakeHome.dir, 'work', 'repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    mkdirSync(join(repo, 'src'), { recursive: true });
    expect(findLessonsProjectRoot(join(repo, 'src'))).toBe(repo);
    // A linked worktree or submodule has a .git file, not a directory.
    const wt = join(fakeHome.dir, 'work', 'wt');
    mkdirSync(wt, { recursive: true });
    writeFileSync(join(wt, '.git'), 'gitdir: /elsewhere\n');
    expect(findLessonsProjectRoot(wt)).toBe(wt);
  });

  it('never treats a git repository at the home directory (dotfiles) as a project', () => {
    mkdirSync(join(fakeHome.dir, '.git'), { recursive: true });
    const plain = join(fakeHome.dir, 'notes');
    mkdirSync(plain, { recursive: true });
    expect(findLessonsProjectRoot(plain)).toBeNull();
  });

  it('returns null outside any project', () => {
    const plain = join(root, 'plain');
    mkdirSync(plain, { recursive: true });
    expect(findLessonsProjectRoot(plain)).toBeNull();
  });

  it('never resolves to the home directory, by lessons or by config', () => {
    lessonsAt(fakeHome.dir, 'lessons.json');
    projectAt(fakeHome.dir);
    const plain = join(fakeHome.dir, 'work', 'plain');
    mkdirSync(plain, { recursive: true });
    expect(findLessonsProjectRoot(fakeHome.dir)).toBeNull();
    expect(findLessonsProjectRoot(plain)).toBeNull();
  });
});
