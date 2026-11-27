/**
 * `generate --check` must not report "in sync" while a removed target's
 * generated files are still on disk: a real run would delete them.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  withRemovedOutputDrift,
  type RemovedOutputDriftArgs,
} from '../../../../src/cli/commands/generate-removed.js';
import { writeLock } from '../../../../src/config/core/lock.js';
import { buildOutputChecksums } from '../../../../src/config/core/lock-outputs.js';
import type { GenerateCommandResult } from '../../../../src/cli/commands/generate.js';

const IN_SYNC: GenerateCommandResult = {
  exitCode: 0,
  data: {
    scope: 'project',
    mode: 'check',
    files: [],
    summary: { created: 0, updated: 0, unchanged: 0 },
  },
  lockWritten: false,
};

let root = '';
let canonicalDir = '';

function leftover(rel: string, content = '# generated\n'): Record<string, string> {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
  return buildOutputChecksums([{ target: 'cursor', path: rel, content, status: 'created' }]);
}

async function lockWith(outputs: Record<string, string>): Promise<void> {
  await writeLock(canonicalDir, {
    generatedAt: '2026-01-01T00:00:00.000Z',
    generatedBy: 'test',
    libVersion: '0.0.0',
    checksums: {},
    extends: {},
    packs: {},
    outputs,
  });
}

const check = (
  result: GenerateCommandResult = IN_SYNC,
  flags: Record<string, string | boolean> = { check: true },
): Promise<GenerateCommandResult> => {
  const args: RemovedOutputDriftArgs = {
    results: [],
    scope: 'project',
    context: { canonicalDir, rootBase: root },
    configuredTargets: ['claude-code'],
    flags,
  };
  return withRemovedOutputDrift(result, args);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-removed-check-'));
  canonicalDir = join(root, '.agentsmesh');
  mkdirSync(canonicalDir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('withRemovedOutputDrift', () => {
  it('fails the check and deletes nothing when a removed target left unmodified files', async () => {
    await lockWith({ ...leftover('.cursor/rules/general.mdc'), ...leftover('.cursor/AGENTS.md') });
    const lock = readFileSync(join(canonicalDir, '.lock'), 'utf-8');

    const result = await check();

    expect(result.exitCode).toBe(1);
    expect(result.data).toEqual({
      ...IN_SYNC.data,
      removed: ['.cursor/AGENTS.md', '.cursor/rules/general.mdc'],
    });
    expect(existsSync(join(root, '.cursor/rules/general.mdc'))).toBe(true);
    expect(existsSync(join(root, '.cursor/AGENTS.md'))).toBe(true);
    expect(readFileSync(join(canonicalDir, '.lock'), 'utf-8')).toBe(lock);
  });

  it('passes when the only leftover is a file the user edited, and says it is kept', async () => {
    await lockWith(leftover('.cursor/rules/general.mdc'));
    writeFileSync(join(root, '.cursor/rules/general.mdc'), 'my own rule\n');

    const result = await check();

    expect(result.exitCode).toBe(0);
    expect(result.data).toEqual({
      ...IN_SYNC.data,
      kept: [{ path: '.cursor/rules/general.mdc', reason: 'edited' }],
    });
  });

  it('passes when nothing is left behind', async () => {
    await lockWith({ '.cursor/rules/gone.mdc': 'sha256:abc' });

    expect(await check()).toBe(IN_SYNC);
  });

  it('leaves a failing result failing', async () => {
    await lockWith({});
    const failing: GenerateCommandResult = { ...IN_SYNC, exitCode: 1 };

    expect(await check(failing)).toBe(failing);
  });

  it('ignores a --targets run, which cannot tell a removed target from a skipped one', async () => {
    await lockWith(leftover('.cursor/rules/general.mdc'));

    expect(await check(IN_SYNC, { check: true, targets: 'claude-code' })).toBe(IN_SYNC);
  });
});
