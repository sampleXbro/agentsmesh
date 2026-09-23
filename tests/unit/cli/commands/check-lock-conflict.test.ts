/**
 * A `.agentsmesh/.lock` left with git conflict markers is reported as a lock
 * conflict, so `check` can point at `agentsmesh merge`; it used to look like a
 * project that was never generated.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../../../../src/cli/commands/check.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-check-conflict-'));
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n',
  );
  writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('runCheck — lock conflict', () => {
  it('flags a lock with git conflict markers', async () => {
    writeFileSync(
      join(root, '.agentsmesh', '.lock'),
      'checksums:\n<<<<<<< HEAD\n  rules/_root.md: sha256:1\n=======\n' +
        '  rules/_root.md: sha256:2\n>>>>>>> feature\n',
    );
    const r = await runCheck({}, root);
    expect([r.exitCode, r.data.hasLock, r.data.lockConflict]).toEqual([1, false, true]);
  });
});
