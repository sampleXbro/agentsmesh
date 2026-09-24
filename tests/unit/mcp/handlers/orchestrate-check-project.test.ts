/**
 * The MCP `check` tool fails on what `agentsmesh check` fails on, on a real
 * project: a `.agentsmesh/.lock` left with git conflict markers is
 * `lockConflict: true`, and a `lessons.json` that cannot be read is reported in
 * `lessonsGraphError` with the same text as the CLI JSON `error`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCheck } from '../../../../src/cli/commands/check.js';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import type { McpContext } from '../../../../src/mcp/context.js';
import { orchestrateHandlers } from '../../../../src/mcp/handlers/orchestrate.js';

let root: string;
const ctx = (): McpContext => ({ projectRoot: root, loadCanonical: vi.fn() });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-mcp-check-project-'));
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
});

describe('orchestrateHandlers.check — lessonsGraphError', () => {
  it('carries the CLI error when lessons.json cannot be read, with the lock in sync', async () => {
    await runGenerate({}, root, { printMatrix: false });
    mkdirSync(join(root, '.agentsmesh', 'lessons'));
    writeFileSync(join(root, '.agentsmesh', 'lessons', 'lessons.json'), '{ not json');

    const out = await orchestrateHandlers.check(ctx());
    const cli = await runCheck({}, root);

    expect(cli.exitCode).toBe(1);
    expect(out.lessonsGraphError).toBe(cli.error);
    expect(out.lessonsGraphError).toMatch(/^Lessons graph unreadable: /);
    expect(out.drift).toBe(false);
  });

  it('is null when the project has no lessons graph', async () => {
    await runGenerate({}, root, { printMatrix: false });

    const out = await orchestrateHandlers.check(ctx());

    expect([out.drift, out.lessonsGraphError]).toEqual([false, null]);
  });
});
