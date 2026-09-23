/**
 * `writeLockFile` rewrites `.agentsmesh/.lock` only when its content changes
 * (`checksums`, `extends`, `packs`, `outputs`), and says whether it did. A run that changes nothing used
 * to rewrite `generated_at` anyway, leaving the git tree dirty after every
 * `generate` and a lock diff in every teammate's clone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeLockFile } from '../../../../src/cli/commands/generate-lock.js';
import { buildChecksums, readLock, writeLock } from '../../../../src/config/core/lock.js';
import type { ResolvedExtend } from '../../../../src/config/resolve/resolver.js';
import * as fsUtils from '../../../../src/utils/filesystem/fs.js';

let configDir = '';
let canonicalDir = '';
const outputs = { 'AGENTS.md': 'sha256:aaa', '.claude/rules/_root.md': 'sha256:bbb' };

const lockText = (): string => readFileSync(join(canonicalDir, '.lock'), 'utf-8');
const write = (runOutputs: Record<string, string>, filtered = false): Promise<boolean> =>
  writeLockFile({ canonicalDir, configDir }, [], runOutputs, filtered);

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'am-lock-stable-'));
  canonicalDir = join(configDir, '.agentsmesh');
  mkdirSync(join(canonicalDir, 'rules'), { recursive: true });
  writeFileSync(join(canonicalDir, 'rules', '_root.md'), '# Root\n');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(configDir, { recursive: true, force: true });
});

describe('writeLockFile — unchanged content', () => {
  it('leaves the lock byte-identical on a later run with the same content', async () => {
    expect(await write(outputs)).toBe(true);
    const first = lockText();
    vi.setSystemTime(new Date('2026-02-02T00:00:00.000Z'));

    expect(await write({ ...outputs })).toBe(false);

    expect(lockText()).toBe(first);
    expect((await readLock(canonicalDir))?.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it("keeps a teammate's lock when only generated_by and lib_version differ", async () => {
    await writeLock(canonicalDir, {
      generatedAt: '2025-12-24T00:00:00.000Z',
      generatedBy: 'alice',
      libVersion: '0.0.1',
      checksums: await buildChecksums(canonicalDir),
      extends: {},
      packs: {},
      outputs,
    });
    const first = lockText();
    vi.stubEnv('USER', 'bob');

    await write(outputs);

    expect(lockText()).toBe(first);
  });

  it('keeps the lock when a filtered run re-records the same outputs', async () => {
    await write(outputs);
    const first = lockText();
    vi.setSystemTime(new Date('2026-02-02T00:00:00.000Z'));

    await write({ 'AGENTS.md': 'sha256:aaa' }, true);

    expect(lockText()).toBe(first);
  });

  it('still refreshes the cache symlink when the lock is left alone', async () => {
    await write(outputs);
    const symlink = vi.spyOn(fsUtils, 'ensureCacheSymlink');

    await write(outputs);

    expect(symlink).toHaveBeenCalledOnce();
  });
});

describe('writeLockFile — changed content', () => {
  const later = new Date('2026-02-02T00:00:00.000Z');

  it('rewrites the lock when a generated output changed', async () => {
    await write(outputs);
    vi.setSystemTime(later);

    expect(await write({ ...outputs, 'AGENTS.md': 'sha256:ccc' })).toBe(true);

    const lock = await readLock(canonicalDir);
    expect(lock?.generatedAt).toBe(later.toISOString());
    expect(lock?.outputs).toEqual({ ...outputs, 'AGENTS.md': 'sha256:ccc' });
  });

  it('rewrites the lock when an output is no longer generated', async () => {
    await write(outputs);
    vi.setSystemTime(later);

    await write({ 'AGENTS.md': 'sha256:aaa' });

    expect((await readLock(canonicalDir))?.outputs).toEqual({ 'AGENTS.md': 'sha256:aaa' });
  });

  it('rewrites the lock when a canonical file changed', async () => {
    await write(outputs);
    writeFileSync(join(canonicalDir, 'rules', '_root.md'), '# Root v2\n');
    vi.setSystemTime(later);

    await write(outputs);

    const lock = await readLock(canonicalDir);
    expect(lock?.generatedAt).toBe(later.toISOString());
    expect(lock?.checksums).toEqual(await buildChecksums(canonicalDir));
  });

  it('rewrites the lock when an extend moved to another version', async () => {
    const extend = (version: string): ResolvedExtend[] => [
      { name: 'base', resolvedPath: configDir, features: ['rules'], version, isRemote: true },
    ];
    await writeLockFile({ canonicalDir, configDir }, extend('v1'), outputs, false);
    vi.setSystemTime(later);

    await writeLockFile({ canonicalDir, configDir }, extend('v2'), outputs, false);

    expect((await readLock(canonicalDir))?.extends).toEqual({ base: 'v2' });
  });

  it('rewrites an old-format lock that has no outputs map', async () => {
    await write({});
    writeFileSync(join(canonicalDir, '.lock'), lockText().replace(/\noutputs:.*$/s, '\n'));
    expect((await readLock(canonicalDir))?.outputs).toBeUndefined();

    await write({});

    expect((await readLock(canonicalDir))?.outputs).toEqual({});
  });

  it('rewrites a lock it cannot read', async () => {
    writeFileSync(join(canonicalDir, '.lock'), 'checksums: [unclosed\n');

    expect(await write(outputs)).toBe(true);

    expect((await readLock(canonicalDir))?.outputs).toEqual(outputs);
  });
});
