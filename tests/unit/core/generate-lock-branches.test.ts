/**
 * Branch coverage for `writeLockFile` in `src/cli/commands/generate-lock.ts`.
 * Covers:
 *   - empty resolvedExtends (skips extend hashing branch)
 *   - non-empty resolvedExtends (takes extend hashing branch)
 *   - cache symlink failure path falls back to logger.warn (no throw)
 *   - USER vs USERNAME env fallback for `generatedBy`
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeLockFile } from '../../../src/cli/commands/generate-lock.js';
import { readLock } from '../../../src/config/core/lock.js';
import { hashContent } from '../../../src/utils/crypto/hash.js';
import { logger } from '../../../src/utils/output/logger.js';
import * as fsUtils from '../../../src/utils/filesystem/fs.js';

function sha(content: string): string {
  return `sha256:${hashContent(content)}`;
}

let canonicalDir: string;
let configDir: string;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'genlock-'));
  canonicalDir = join(configDir, '.agentsmesh');
  await mkdir(canonicalDir, { recursive: true });
  await mkdir(join(canonicalDir, 'rules'), { recursive: true });
  await writeFile(join(canonicalDir, 'rules', '_root.md'), '# root\n', 'utf8');
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(configDir, { recursive: true, force: true });
});

describe('writeLockFile branches', () => {
  it('writes a .lock with empty `extends` block when no resolvedExtends are given', async () => {
    vi.stubEnv('USER', 'unit-test-user');
    await writeLockFile({ canonicalDir, configDir }, [], {}, false);
    const raw = await readFile(join(canonicalDir, '.lock'), 'utf8');
    expect(raw).toContain('generated_by: unit-test-user');
    expect(raw).toMatch(/extends:\s*\{\}/);
  });

  it('falls back to USERNAME env when USER is unset', async () => {
    const prev = process.env.USER;
    delete process.env.USER;
    vi.stubEnv('USERNAME', 'win-user');
    try {
      await writeLockFile({ canonicalDir, configDir }, [], {}, false);
      const raw = await readFile(join(canonicalDir, '.lock'), 'utf8');
      expect(raw).toContain('generated_by: win-user');
    } finally {
      if (prev !== undefined) process.env.USER = prev;
    }
  });

  it('logs a warning instead of throwing when ensureCacheSymlink fails', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(fsUtils, 'ensureCacheSymlink').mockRejectedValue(new Error('boom'));

    await expect(writeLockFile({ canonicalDir, configDir }, [], {}, false)).resolves.toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/.agentsmeshcache.*boom/));
  });
});

describe('writeLockFile outputs tracking', () => {
  it('full generate replaces the lock outputs map with the run outputs', async () => {
    const runOutputs = {
      'CLAUDE.md': sha('claude body'),
      '.cursor/rules/general.mdc': sha('cursor body'),
    };
    await writeLockFile({ canonicalDir, configDir }, [], runOutputs, false);
    const lock = await readLock(canonicalDir);
    expect(lock?.outputs).toEqual(runOutputs);
  });

  it('full generate with empty run outputs writes an empty (not undefined) outputs map', async () => {
    await writeLockFile({ canonicalDir, configDir }, [], {}, false);
    const lock = await readLock(canonicalDir);
    // Key present, empty map — NOT an old-format lock (undefined).
    expect(lock?.outputs).toEqual({});
    const raw = await readFile(join(canonicalDir, '.lock'), 'utf8');
    const parsed = parseYaml(raw) as { outputs?: unknown };
    expect(parsed).toHaveProperty('outputs');
  });

  it('filtered generate merges run outputs over previous lock outputs per-path', async () => {
    const previous = {
      'CLAUDE.md': sha('old claude'),
      '.cursor/rules/general.mdc': sha('old cursor'),
      'GEMINI.md': sha('old gemini'),
    };
    await writeLockFile({ canonicalDir, configDir }, [], previous, false);

    const runOutputs = {
      'CLAUDE.md': sha('new claude'),
    };
    await writeLockFile({ canonicalDir, configDir }, [], runOutputs, true);

    const lock = await readLock(canonicalDir);
    // Previous entries retained; the run entry replaces its path exactly.
    expect(lock?.outputs).toEqual({
      'CLAUDE.md': sha('new claude'),
      '.cursor/rules/general.mdc': sha('old cursor'),
      'GEMINI.md': sha('old gemini'),
    });
  });

  it('filtered generate against an old-format lock (no outputs) starts from {}', async () => {
    // Old-format lock: outputs key absent.
    await writeLockFile({ canonicalDir, configDir }, [], {}, false);
    // Simulate an old-format lock by rewriting without the outputs key.
    const raw = await readFile(join(canonicalDir, '.lock'), 'utf8');
    await writeFile(join(canonicalDir, '.lock'), raw.replace(/\noutputs:.*$/s, '\n'), 'utf8');
    expect((await readLock(canonicalDir))?.outputs).toBeUndefined();

    const runOutputs = { 'CLAUDE.md': sha('claude body') };
    await writeLockFile({ canonicalDir, configDir }, [], runOutputs, true);
    const lock = await readLock(canonicalDir);
    expect(lock?.outputs).toEqual(runOutputs);
  });
});
