import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalFiles } from '../../../src/core/types.js';
import { materializePack } from '../../../src/install/pack/pack-writer.js';
import { logger } from '../../../src/utils/output/logger.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return { ...real, mkdtemp: vi.fn(real.mkdtemp), rename: vi.fn(real.rename), rm: vi.fn(real.rm) };
});

const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const renameMock = vi.mocked(rename);
const rmMock = vi.mocked(rm);

const META = {
  name: 'pack',
  source: 'github:org/repo@abc',
  version: 'abc',
  source_kind: 'github' as const,
  installed_at: '2026-09-04T00:00:00Z',
  updated_at: '2026-09-04T00:00:00Z',
  features: ['rules'] as ('rules' | 'skills' | 'commands' | 'agents')[],
};

let tmpRoot: string;
let srcDir: string;
let packsDir: string;
let tmpDir: string;
let oldDir: string;
let finalDir: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'am-'));
  srcDir = join(tmpRoot, 'src');
  packsDir = join(tmpRoot, 'packs');
  mkdirSync(srcDir, { recursive: true });
  vi.mocked(mkdtemp).mockImplementation(async (prefix) => {
    const transactionDir = await real.mkdtemp(prefix);
    tmpDir = join(transactionDir, 'new');
    oldDir = join(transactionDir, 'old');
    return transactionDir;
  });
  finalDir = join(packsDir, 'pack');
});

afterEach(() => {
  renameMock.mockReset();
  rmMock.mockReset();
  vi.restoreAllMocks();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function canonicalWithRule(body: string): CanonicalFiles {
  const source = join(srcDir, 'a.md');
  writeFileSync(source, body, 'utf-8');
  return {
    rules: [{ source, root: false, targets: [], description: 'a', globs: [], body }],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

const install = (body: string): ReturnType<typeof materializePack> =>
  materializePack(packsDir, 'pack', canonicalWithRule(body), META);
const ruleAt = (dir: string): string => readFileSync(join(dir, 'rules', 'a.md'), 'utf-8');

function blockRenames(...blocked: Array<'new' | 'old'>): void {
  renameMock.mockImplementation(async (from, to) => {
    if (String(to) === finalDir && blocked.some((name) => name === basename(String(from)))) {
      throw new Error(`rename blocked: ${String(from)} -> ${String(to)}`);
    }
    return real.rename(from, to);
  });
}

function blockRm(path: 'new' | 'old'): void {
  rmMock.mockImplementation(async (target, options) => {
    if (basename(String(target)) === path) throw new Error(`rm blocked: ${String(target)}`);
    return real.rm(target, options);
  });
}

describe('materializePack swap failures', () => {
  it('restores the previous pack when the tmp -> final swap fails', async () => {
    await install('first');
    blockRenames('new');

    await expect(install('second')).rejects.toThrow(/rename blocked/);

    expect(ruleAt(finalDir)).toBe('first');
    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(tmpDir)).toBe(false);
  });

  it('warns and retains the backup when the restore rename also fails', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await install('first');
    blockRenames('new', 'old');

    await expect(install('second')).rejects.toThrow(/rename blocked/);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]?.[0];
    expect(message).toContain(`the prior contents remain at "${oldDir.replaceAll('\\', '/')}"`);
    expect(message).toContain(`rename blocked: ${oldDir} -> ${finalDir}`);
    expect(existsSync(finalDir)).toBe(false);
    expect(ruleAt(oldDir)).toBe('first');
    expect(existsSync(tmpDir)).toBe(false);
  });

  it('still throws the original error when staging cleanup fails', async () => {
    blockRenames('new');
    blockRm('new');

    await expect(install('first')).rejects.toThrow(/rename blocked/);

    expect(existsSync(finalDir)).toBe(false);
    expect(ruleAt(tmpDir)).toBe('first');
  });

  it('keeps the new pack live when backup cleanup fails after a successful swap', async () => {
    await install('first');
    blockRm('old');

    const meta = await install('second');

    expect(meta.name).toBe('pack');
    expect(ruleAt(finalDir)).toBe('second');
    expect(ruleAt(oldDir)).toBe('first');
    expect(existsSync(tmpDir)).toBe(false);
  });
});
