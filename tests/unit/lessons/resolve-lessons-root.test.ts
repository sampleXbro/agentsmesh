/**
 * The hook and the MCP server are started in whatever directory the agent's
 * session is in, which in a monorepo is often a package, not the repository
 * root. Rooting lessons at the start directory made recall silently empty
 * there, and made the MCP server announce that lessons were not set up while
 * its own tools could still find them.
 *
 * The interactive CLI deliberately stays rooted at the current directory and
 * warns instead (see ancestorLessonsProjectDir). This helper is for the two
 * callers that have no human to read a warning.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveLessonsRoot } from '../../../src/lessons/paths.js';

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'amesh-lroot-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

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
});
