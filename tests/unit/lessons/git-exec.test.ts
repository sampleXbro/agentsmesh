import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGit } from '../../../src/lessons/git-exec.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amesh-git-exec-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('runGit', () => {
  it('returns git output and exit status', () => {
    const r = runGit(dir, ['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^git version /);
  });

  it('reports status -1 with empty output when git cannot start', () => {
    expect(runGit(join(dir, 'missing'), ['--version'])).toEqual({
      status: -1,
      stdout: '',
      stderr: '',
    });
  });
});
