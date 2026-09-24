import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitOperation } from '../../../src/lessons/git-operation.js';
import { initRepo } from '../../helpers/temp-git-repo.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-git-op-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('gitOperation', () => {
  it('is null outside git', () => {
    expect(gitOperation(root)).toBeNull();
  });

  it.each([
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
    ['MERGE_HEAD', 'merge'],
  ])('reads %s as %s', (marker, operation) => {
    initRepo(root);
    const path = join(root, '.git', marker);
    if (marker.startsWith('rebase')) mkdirSync(path);
    else writeFileSync(path, 'deadbeef\n');
    expect(gitOperation(root)).toBe(operation);
  });

  it('is none in a repository with nothing in progress', () => {
    initRepo(root);
    expect(gitOperation(root)).toBe('none');
  });
});
