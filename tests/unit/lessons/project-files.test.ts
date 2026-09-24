import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  gitHistoryOf,
  listProjectFiles,
  projectFilesOf,
} from '../../../src/lessons/project-files.js';
import { commitAll, initRepo } from '../../helpers/temp-git-repo.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-projfiles-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('listProjectFiles', () => {
  it('lists every on-disk file, project-relative with forward slashes', () => {
    mkdirSync(join(root, 'src', 'nested'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(root, 'src', 'nested', 'b.ts'), 'export const b = 2;\n');

    const files = listProjectFiles(root);
    expect(files).not.toBeNull();
    expect(files!.has('src/a.ts')).toBe(true);
    expect(files!.has('src/nested/b.ts')).toBe(true);
  });

  it('includes present-but-gitignored files (liveness is on-disk existence, not git tracking)', () => {
    // A glob over a present build artifact must read as LIVE, not dead — so the
    // file list must include it even though it is gitignored.
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'dist/\n');
    writeFileSync(join(root, 'dist', 'cli.js'), '// built\n');

    const files = listProjectFiles(root)!;
    expect(files.has('dist/cli.js')).toBe(true);
  });

  it('skips .git and node_modules', () => {
    writeFileSync(join(root, 'index.ts'), 'x\n');
    mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'dep', 'index.js'), 'y\n');
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref\n');

    const files = listProjectFiles(root)!;
    expect(files.has('index.ts')).toBe(true);
    expect([...files].some((p) => p.includes('node_modules'))).toBe(false);
    expect([...files].some((p) => p.startsWith('.git/'))).toBe(false);
  });

  it('returns null (unknown) instead of a partial list when the walk passes the file cap', () => {
    for (const name of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) writeFileSync(join(root, name), 'x\n');
    expect(listProjectFiles(root, 3)).toBeNull();
    expect([...listProjectFiles(root, 4)!].sort()).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
  });

  it('carries no git evidence outside a git work tree', () => {
    writeFileSync(join(root, 'a.ts'), 'x\n');
    expect(gitHistoryOf(listProjectFiles(root)!)).toBeNull();
  });

  it('carries the git evidence of the project inside a work tree', () => {
    initRepo(root);
    writeFileSync(join(root, 'a.ts'), 'x\n');
    commitAll(root, 'init');
    expect([...gitHistoryOf(listProjectFiles(root)!)!.tracked]).toEqual(['a.ts']);
  });
});

describe('gitHistoryOf', () => {
  it('is null for a plain set (no evidence, so nothing can be proven dead)', () => {
    expect(gitHistoryOf(new Set(['a.ts']))).toBeNull();
  });

  it('returns the evidence attached by projectFilesOf', () => {
    const history = {
      tracked: new Set(['a.ts']),
      deleted: new Set<string>(),
      renamedAway: new Set<string>(),
    };
    const files = projectFilesOf(['a.ts'], () => history);
    expect([...files]).toEqual(['a.ts']);
    expect(gitHistoryOf(files)).toBe(history);
  });
});
