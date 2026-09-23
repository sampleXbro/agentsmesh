/**
 * The MCP `generate` tool reports `lockfileUpdated` from the real lock write.
 * `generate` leaves `.agentsmesh/.lock` byte-identical when nothing changed,
 * so a no-op run must not claim it updated the lock.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { orchestrateHandlers } from '../../../../src/mcp/handlers/orchestrate.js';

let root: string;
const ctx = (): McpContext => ({ projectRoot: root, loadCanonical: vi.fn() });
const lockPath = (): string => join(root, '.agentsmesh', '.lock');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-mcp-generate-lock-'));
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n',
  );
  writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('orchestrateHandlers.generate — lockfileUpdated', () => {
  it('is true when the run writes the lock and false when a later run changes nothing', async () => {
    const first = await orchestrateHandlers.generate(ctx(), {});
    const lock = readFileSync(lockPath(), 'utf8');

    const second = await orchestrateHandlers.generate(ctx(), {});

    expect([first.lockfileUpdated, second.lockfileUpdated]).toEqual([true, false]);
    expect(readFileSync(lockPath(), 'utf8')).toBe(lock);
  });

  it('is true again when a canonical change rewrites the lock', async () => {
    await orchestrateHandlers.generate(ctx(), {});
    writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# v2\n');

    const out = await orchestrateHandlers.generate(ctx(), {});

    expect(out.lockfileUpdated).toBe(true);
  });

  it('is false for a dry run, which writes no lock', async () => {
    const out = await orchestrateHandlers.generate(ctx(), { dry_run: true });

    expect([out.lockfileUpdated, existsSync(lockPath())]).toEqual([false, false]);
  });
});
