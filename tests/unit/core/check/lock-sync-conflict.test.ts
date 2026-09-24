/**
 * The public `check()` reports a `.agentsmesh/.lock` left with git conflict
 * markers as `lockConflict: true`, so API users can run `agentsmesh merge`
 * instead of treating the project as never generated.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { check, loadConfig, type LockSyncReport } from '../../../../src/public/index.js';

let root: string;
const report = async (): Promise<LockSyncReport> => {
  const { config } = await loadConfig(root);
  return check({ config, configDir: root, canonicalDir: join(root, '.agentsmesh') });
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-check-api-conflict-'));
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n',
  );
  writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('public check() — lockConflict', () => {
  it('is true for a lock with git conflict markers', async () => {
    writeFileSync(
      join(root, '.agentsmesh', '.lock'),
      'checksums:\n<<<<<<< HEAD\n  rules/_root.md: sha256:1\n=======\n' +
        '  rules/_root.md: sha256:2\n>>>>>>> feature\n',
    );
    const r = await report();
    expect([r.inSync, r.hasLock, r.lockConflict]).toEqual([false, false, true]);
  });

  it('is false for a project that has no lock yet', async () => {
    const r = await report();
    expect([r.inSync, r.hasLock, r.lockConflict]).toEqual([false, false, false]);
  });

  it('is false for a readable lock', async () => {
    await runGenerate({}, root, { printMatrix: false });
    const r = await report();
    expect([r.inSync, r.hasLock, r.lockConflict]).toEqual([true, true, false]);
  });
});
