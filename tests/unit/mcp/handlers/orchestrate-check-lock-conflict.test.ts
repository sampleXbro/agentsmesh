/**
 * The MCP `check` tool reports a `.agentsmesh/.lock` left with git conflict
 * markers as `lockConflict: true`, like `agentsmesh check --json`, so an agent
 * can run `agentsmesh merge` instead of treating the project as never generated.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import type { McpContext } from '../../../../src/mcp/context.js';
import { orchestrateHandlers } from '../../../../src/mcp/handlers/orchestrate.js';

let root: string;
const ctx = (): McpContext => ({ projectRoot: root, loadCanonical: vi.fn() });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-mcp-check-conflict-'));
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n',
  );
  writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('orchestrateHandlers.check — lockConflict', () => {
  it('is true for a lock with git conflict markers', async () => {
    writeFileSync(
      join(root, '.agentsmesh', '.lock'),
      'checksums:\n<<<<<<< HEAD\n  rules/_root.md: sha256:1\n=======\n' +
        '  rules/_root.md: sha256:2\n>>>>>>> feature\n',
    );
    const out = await orchestrateHandlers.check(ctx());
    expect([out.drift, out.lockConflict]).toEqual([true, true]);
  });

  it('is false for a project that has no lock yet', async () => {
    const out = await orchestrateHandlers.check(ctx());
    expect([out.drift, out.lockConflict]).toEqual([true, false]);
  });

  it('is false for a readable lock', async () => {
    await runGenerate({}, root, { printMatrix: false });
    const out = await orchestrateHandlers.check(ctx());
    expect([out.drift, out.lockConflict]).toEqual([false, false]);
  });
});
