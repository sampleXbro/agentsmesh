import { mkdirSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readGitPathHistory, scanGitPathHistory } from '../../../src/lessons/git-path-history.js';
import { commitAll, git, initRepo, writeFile } from '../../helpers/temp-git-repo.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-githist-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scanGitPathHistory', () => {
  it('returns null outside a git work tree', () => {
    writeFile(root, 'src/a.ts');
    expect(scanGitPathHistory(root)).toBeNull();
  });

  it('returns null when HEAD has no commit yet (no history to judge)', () => {
    initRepo(root);
    writeFile(root, 'src/a.ts');
    git(root, ['add', '-A']);
    expect(scanGitPathHistory(root)).toBeNull();
  });

  it('lists tracked paths, including a tracked file missing from disk', () => {
    initRepo(root);
    writeFile(root, 'src/a.ts');
    writeFile(root, 'src/b.ts');
    commitAll(root, 'init');
    unlinkSync(join(root, 'src/b.ts'));

    const history = scanGitPathHistory(root)!;
    expect([...history.tracked].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect([...history.deleted]).toEqual([]);
    expect([...history.renamedAway]).toEqual([]);
  });

  it('records committed deletions and the old side of committed renames', () => {
    initRepo(root);
    writeFile(root, 'src/old-name.ts', 'export const unique = "rename me please";\n');
    writeFile(root, 'src/doomed.ts');
    writeFile(root, 'src/kept.ts');
    commitAll(root, 'init');
    git(root, ['mv', 'src/old-name.ts', 'src/new-name.ts']);
    git(root, ['rm', '--quiet', 'src/doomed.ts']);
    commitAll(root, 'rename + delete');

    const history = scanGitPathHistory(root)!;
    expect([...history.tracked].sort()).toEqual(['src/kept.ts', 'src/new-name.ts']);
    expect([...history.deleted]).toEqual(['src/doomed.ts']);
    expect([...history.renamedAway]).toEqual(['src/old-name.ts']);
  });

  it('keeps non-ASCII paths unquoted', () => {
    initRepo(root);
    writeFile(root, 'src/café.ts');
    writeFile(root, 'src/kept.ts');
    commitAll(root, 'init');
    git(root, ['rm', '--quiet', 'src/café.ts']);
    commitAll(root, 'delete');

    expect([...scanGitPathHistory(root)!.deleted]).toEqual(['src/café.ts']);
  });

  it('reports paths relative to a project root nested inside the repo', () => {
    initRepo(root);
    writeFile(root, 'pkg/app/src/gone.ts');
    writeFile(root, 'pkg/app/src/kept.ts');
    writeFile(root, 'other/gone.ts');
    commitAll(root, 'init');
    git(root, ['rm', '--quiet', 'pkg/app/src/gone.ts', 'other/gone.ts']);
    commitAll(root, 'delete');

    const history = scanGitPathHistory(join(root, 'pkg/app'))!;
    expect([...history.tracked]).toEqual(['src/kept.ts']);
    expect([...history.deleted]).toEqual(['src/gone.ts']);
  });

  it('returns null (unknown) when git runs past the time bound', () => {
    initRepo(root);
    writeFile(root, 'src/a.ts');
    commitAll(root, 'init');
    expect(scanGitPathHistory(root, 1)).toBeNull();
  });
});

describe('readGitPathHistory', () => {
  it('scans once per project root and reuses the result', () => {
    initRepo(root);
    writeFile(root, 'src/a.ts');
    commitAll(root, 'init');
    const first = readGitPathHistory(root);
    mkdirSync(join(root, 'lib'));
    writeFile(root, 'lib/b.ts');
    commitAll(root, 'more');
    expect(readGitPathHistory(root)).toBe(first);
  });
});
