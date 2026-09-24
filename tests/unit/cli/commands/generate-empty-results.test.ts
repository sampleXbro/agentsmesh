/**
 * A generate run that yields ZERO outputs (every feature disabled, the last
 * pack just uninstalled) must still sweep the files earlier runs generated and
 * reset the lock's `outputs` provenance. Before the fix `handleEmptyResults`
 * returned early: orphans stayed live, the lock kept claiming them, and
 * `generate --check` reported in-sync.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { handleEmptyResults } from '../../../../src/cli/commands/generate-empty-run.js';
import { readLock, writeLock } from '../../../../src/config/core/lock.js';
import { logger } from '../../../../src/utils/output/logger.js';

const ORPHAN = '.claude/skills/demo/SKILL.md';
const USER_OWNED = '.claude/skills/mine/SKILL.md';

let testDir = '';
let canonicalDir = '';

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), 'am-'));
  canonicalDir = join(testDir, '.agentsmesh');
  mkdirSync(canonicalDir, { recursive: true });
  writeFileSync(
    join(testDir, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: []\n',
  );
  for (const rel of [ORPHAN, USER_OWNED]) {
    mkdirSync(join(testDir, rel, '..'), { recursive: true });
    writeFileSync(join(testDir, rel), '# skill\n');
  }
  await writeLock(canonicalDir, {
    generatedAt: '2026-01-01T00:00:00.000Z',
    generatedBy: 'test',
    libVersion: '0.0.0',
    checksums: {},
    extends: {},
    packs: {},
    outputs: { [ORPHAN]: 'sha256:previous' },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(testDir, { recursive: true, force: true });
});

describe('runGenerate — zero-output run', () => {
  it('deletes the previously generated orphan and empties lock.outputs', async () => {
    const result = await runGenerate({}, testDir, { printMatrix: false });

    expect(result.exitCode).toBe(0);
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(testDir, ORPHAN))).toBe(false);
    expect((await readLock(canonicalDir))?.outputs).toEqual({});
  });

  it('leaves a file under a managed dir alone when the lock never claimed it', async () => {
    await runGenerate({}, testDir, { printMatrix: false });

    expect(existsSync(join(testDir, USER_OWNED))).toBe(true);
  });

  it('--check reports the live orphan as drift and deletes nothing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const result = await runGenerate({ check: true }, testDir, { printMatrix: false });

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(testDir, ORPHAN))).toBe(true);
    expect((await readLock(canonicalDir))?.outputs).toEqual({ [ORPHAN]: 'sha256:previous' });
    expect(errorSpy.mock.calls.map((c) => c[0])).toContain(`[check] stale ${ORPHAN}`);
  });

  it('--check is in sync once the orphan is gone', async () => {
    rmSync(join(testDir, ORPHAN));

    const result = await runGenerate({ check: true }, testDir, { printMatrix: false });

    expect(result.exitCode).toBe(0);
  });

  it('--dry-run neither deletes the orphan nor touches the lock', async () => {
    const result = await runGenerate({ 'dry-run': true }, testDir, { printMatrix: false });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(testDir, ORPHAN))).toBe(true);
    expect((await readLock(canonicalDir))?.outputs).toEqual({ [ORPHAN]: 'sha256:previous' });
  });

  it('a filtered run (--targets) merges and never prunes, matching the lock rule', async () => {
    const result = await runGenerate({ targets: 'claude-code' }, testDir, { printMatrix: false });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(testDir, ORPHAN))).toBe(true);
    expect((await readLock(canonicalDir))?.outputs).toEqual({ [ORPHAN]: 'sha256:previous' });
  });
});

describe('handleEmptyResults: empty reason in global scope', () => {
  const args = (activeTargets: string[]): Parameters<typeof handleEmptyResults>[0] => ({
    mode: 'generate',
    scope: 'global',
    dryRun: true,
    context: { canonicalDir, configDir: testDir, rootBase: testDir },
    resolvedExtends: [],
    flags: {},
    root: testDir,
    options: { printMatrix: false },
    activeTargets,
    configuredTargets: activeTargets,
  });

  it('names no-global-support when every active target is cloud-only', async () => {
    const r = await handleEmptyResults(args(['jules', 'replit-agent']));
    expect(r.data.emptyReason).toBe('no-global-support');
  });

  it('gives no reason when at least one target has a global layout', async () => {
    const r = await handleEmptyResults(args(['jules', 'claude-code']));
    expect(r.data.emptyReason).toBeUndefined();
  });

  it('gives no reason for an empty target list', async () => {
    const r = await handleEmptyResults(args([]));
    expect(r.data.emptyReason).toBeUndefined();
  });
});
