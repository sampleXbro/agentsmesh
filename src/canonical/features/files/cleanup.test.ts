import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupStaleVerbatimOutputs, mergeVerbatimOutputs } from './cleanup.js';

const ROOT = join(tmpdir(), `agentsmesh-files-cleanup-${process.pid}`);

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
});
afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

describe('cleanupStaleVerbatimOutputs', () => {
  it('deletes previous paths missing from current when prune is true', async () => {
    writeFileSync(join(ROOT, 'old.toml'), 'gone\n');
    writeFileSync(join(ROOT, 'keep.toml'), 'stay\n');
    await cleanupStaleVerbatimOutputs({
      projectRoot: ROOT,
      previous: ['old.toml', 'keep.toml'],
      current: ['keep.toml'],
      prune: true,
    });
    expect(existsSync(join(ROOT, 'old.toml'))).toBe(false);
    expect(existsSync(join(ROOT, 'keep.toml'))).toBe(true);
  });

  it('leaves stale paths when prune is false', async () => {
    writeFileSync(join(ROOT, 'old.toml'), 'gone\n');
    await cleanupStaleVerbatimOutputs({
      projectRoot: ROOT,
      previous: ['old.toml'],
      current: [],
      prune: false,
    });
    expect(existsSync(join(ROOT, 'old.toml'))).toBe(true);
  });
});

describe('mergeVerbatimOutputs', () => {
  it('replaces on a full run and merges on a filtered run', () => {
    expect(mergeVerbatimOutputs(['a', 'b'], ['b'], false)).toEqual(['b']);
    expect(mergeVerbatimOutputs(['a', 'b'], ['c'], true)).toEqual(['a', 'b', 'c']);
    expect(mergeVerbatimOutputs(['a'], [], false)).toBeUndefined();
  });
});
