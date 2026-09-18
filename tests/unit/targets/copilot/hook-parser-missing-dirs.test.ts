/**
 * Covers the `.catch(() => [])` arms in src/targets/copilot/hook-parser.ts.
 * readDirRecursiveNoSymlinks swallows ENOENT/ENOTDIR/EACCES itself, so only a
 * rejected listing (e.g. EIO wrapped in FileSystemError) reaches those arms.
 */
import { AB_HOOKS } from '../../../../src/core/canonical-paths.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ImportResult } from '../../../../src/core/types.js';

const mockReadDir = vi.hoisted(() => vi.fn<(dir: string) => Promise<string[]>>());

vi.mock('../../../../src/utils/filesystem/fs.js', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, readDirRecursiveNoSymlinks: mockReadDir };
});

import { importHooks } from '../../../../src/targets/copilot/hook-parser.js';
import {
  COPILOT_TARGET,
  COPILOT_HOOKS_DIR,
  COPILOT_LEGACY_HOOKS_DIR,
  COPILOT_GLOBAL_HOOKS_DIR,
} from '../../../../src/targets/copilot/constants.js';

interface FsModule {
  readDirRecursiveNoSymlinks: (dir: string) => Promise<string[]>;
}

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'am-'));
  mockReadDir.mockReset();
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('importHooks — rejected directory listings', () => {
  it('swallows rejections from both the hooks and legacy listings', async () => {
    mockReadDir.mockRejectedValue(new Error('EIO: i/o error'));
    const results: ImportResult[] = [];

    await expect(importHooks(projectRoot, results)).resolves.toBeUndefined();

    expect(results).toEqual([]);
    expect(existsSync(join(projectRoot, AB_HOOKS))).toBe(false);
    expect(mockReadDir.mock.calls).toEqual([
      [join(projectRoot, COPILOT_HOOKS_DIR)],
      [join(projectRoot, COPILOT_LEGACY_HOOKS_DIR)],
    ]);
  });

  it('skips the legacy listing entirely when legacyDirRel is null', async () => {
    mockReadDir.mockRejectedValue(new Error('EIO: i/o error'));
    const results: ImportResult[] = [];

    await importHooks(projectRoot, results, {
      hooksDirRel: COPILOT_GLOBAL_HOOKS_DIR,
      legacyDirRel: null,
    });

    expect(results).toEqual([]);
    expect(mockReadDir.mock.calls).toEqual([[join(projectRoot, COPILOT_GLOBAL_HOOKS_DIR)]]);
  });

  it('still imports legacy wrappers when only the hooks listing rejects', async () => {
    const actual = await vi.importActual<FsModule>('../../../../src/utils/filesystem/fs.js');
    const hooksDir = join(projectRoot, COPILOT_HOOKS_DIR);
    mockReadDir.mockImplementation((dir) =>
      dir === hooksDir
        ? Promise.reject(new Error('EIO: i/o error'))
        : actual.readDirRecursiveNoSymlinks(dir),
    );
    const legacyDir = join(projectRoot, COPILOT_LEGACY_HOOKS_DIR);
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'PreToolUse-0.sh'), '#!/bin/sh\npnpm lint\n');
    const results: ImportResult[] = [];

    await importHooks(projectRoot, results);

    expect(results).toEqual([
      {
        fromTool: COPILOT_TARGET,
        fromPath: hooksDir,
        toPath: AB_HOOKS,
        feature: 'hooks',
      },
    ]);
    const hooks = parseYaml(readFileSync(join(projectRoot, AB_HOOKS), 'utf-8'));
    expect(hooks).toEqual({
      PreToolUse: [{ matcher: '*', command: 'pnpm lint', type: 'command' }],
    });
  });
});
