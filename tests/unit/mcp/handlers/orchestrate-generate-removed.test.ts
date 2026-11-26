/**
 * The MCP `generate` tool tells the agent which files a run removed because
 * their target left `targets:`, and which it kept: as `removed`, `kept`, and
 * one warning per kept file (same words as the CLI).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { orchestrateHandlers } from '../../../../src/mcp/handlers/orchestrate.js';
import { logger } from '../../../../src/utils/output/logger.js';

const REMOVED = [
  '.cursor/AGENTS.md',
  '.cursor/rules/general.mdc',
  '.cursor/skills/demo/SKILL.md',
  'AGENTS.md',
];
const SHARED_WARNINGS = [
  'Kept .cursor/hooks.json: it is a shared tool config and no target generates it now. Remove the agentsmesh entries yourself if you do not need them.',
  'Kept .cursor/mcp.json: it is a shared tool config and no target generates it now. Remove the agentsmesh entries yourself if you do not need them.',
];
const EDITED_WARNING =
  'Kept .cursor/rules/general.mdc: you edited it, and no target generates it now. Delete it yourself if you do not need it.';

let root = '';
const ctx = (): McpContext => ({ projectRoot: root, loadCanonical: vi.fn() });
const onDisk = (rel: string): boolean => existsSync(join(root, rel));

function write(rel: string, content: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function setTargets(targets: string[]): void {
  write(
    'agentsmesh.yaml',
    `version: 1\ntargets: [${targets.join(', ')}]\nfeatures: [rules, skills, mcp, hooks]\n`,
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-mcp-generate-removed-'));
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  write('.agentsmesh/rules/_root.md', '---\nroot: true\ndescription: Root\n---\n# Root\n');
  write('.agentsmesh/skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo\n---\n# Demo\n');
  write('.agentsmesh/mcp.json', '{"mcpServers":{"s":{"command":"node","args":["x.js"]}}}');
  write(
    '.agentsmesh/hooks.yaml',
    'PostToolUse:\n  - matcher: Edit\n    type: command\n    command: echo hi\n',
  );
  setTargets(['claude-code', 'cursor']);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('orchestrateHandlers.generate — removed targets', () => {
  it('returns the removed files, the kept files and one warning per kept file', async () => {
    await orchestrateHandlers.generate(ctx(), {});
    setTargets(['claude-code']);

    const out = await orchestrateHandlers.generate(ctx(), {});

    expect(out.removed).toEqual(REMOVED);
    expect(out.kept).toEqual([
      { path: '.cursor/hooks.json', reason: 'shared' },
      { path: '.cursor/mcp.json', reason: 'shared' },
    ]);
    expect(out.warnings).toEqual(SHARED_WARNINGS);
    expect(REMOVED.filter(onDisk)).toEqual([]);
  });

  it('keeps an edited file and says so in the warning', async () => {
    await orchestrateHandlers.generate(ctx(), {});
    const edited = join(root, '.cursor/rules/general.mdc');
    writeFileSync(edited, `${readFileSync(edited, 'utf-8')}\nMy own rule.\n`);
    setTargets(['claude-code']);

    const out = await orchestrateHandlers.generate(ctx(), {});

    expect(out.removed).toEqual(['.cursor/AGENTS.md', '.cursor/skills/demo/SKILL.md', 'AGENTS.md']);
    expect(out.kept).toEqual([
      { path: '.cursor/hooks.json', reason: 'shared' },
      { path: '.cursor/mcp.json', reason: 'shared' },
      { path: '.cursor/rules/general.mdc', reason: 'edited' },
    ]);
    expect(out.warnings).toEqual([...SHARED_WARNINGS, EDITED_WARNING]);
    expect(onDisk('.cursor/rules/general.mdc')).toBe(true);
  });

  it('lists what a dry run would remove and deletes nothing', async () => {
    await orchestrateHandlers.generate(ctx(), {});
    setTargets(['claude-code']);

    const out = await orchestrateHandlers.generate(ctx(), { dry_run: true });

    expect(out.removed).toEqual(REMOVED);
    expect(out.warnings).toEqual(SHARED_WARNINGS);
    expect(REMOVED.filter(onDisk)).toEqual(REMOVED);
  });

  it('removes nothing in a run limited to some targets', async () => {
    await orchestrateHandlers.generate(ctx(), {});
    setTargets(['claude-code']);

    const out = await orchestrateHandlers.generate(ctx(), { targets: ['claude-code'] });

    expect([out.removed, out.kept, out.warnings]).toEqual([[], [], []]);
    expect(REMOVED.filter(onDisk)).toEqual(REMOVED);
  });

  it('returns empty lists when no target was removed', async () => {
    const out = await orchestrateHandlers.generate(ctx(), {});

    expect([out.removed, out.kept, out.warnings]).toEqual([[], [], []]);
  });
});
