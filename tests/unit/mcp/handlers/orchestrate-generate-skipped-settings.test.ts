/**
 * The MCP `generate` tool tells the agent which settings from packs and
 * extends it skipped: as `skippedSettings` and as the warning text.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { orchestrateHandlers } from '../../../../src/mcp/handlers/orchestrate.js';
import { logger } from '../../../../src/utils/output/logger.js';

const WARNING =
  '[agentsmesh] Skipped MCP servers from installed packs or extends: sharedsrv. ' +
  'Your own mcp.json has no "mcpServers" key, so AgentsMesh does not write them to your tools: your tools keep their own servers, ' +
  'and a file AgentsMesh wrote only from them is removed. ' +
  'To use them, list your servers under "mcpServers" in mcp.json, or run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh) ' +
  'to copy in the servers your tools already have, then generate again.';

let base = '';
let root = '';
const ctx = (): McpContext => ({ projectRoot: root, loadCanonical: vi.fn() });

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'am-mcp-generate-skipped-'));
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  const shared = join(base, 'shared', '.agentsmesh');
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, 'mcp.json'), '{"mcpServers":{"sharedsrv":{"command":"s"}}}');
  root = join(base, 'project');
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, mcp]\n' +
      'extends:\n  - name: base\n    source: ../shared\n    features: [mcp]\n',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('orchestrateHandlers.generate — skipped settings', () => {
  it('returns the skipped servers and the warning', async () => {
    const out = await orchestrateHandlers.generate(ctx(), {});

    expect(out.skippedSettings).toEqual([{ feature: 'mcp', items: ['sharedsrv'] }]);
    expect(out.warnings).toEqual([WARNING]);
  });

  it('returns empty lists when nothing was skipped', async () => {
    writeFileSync(join(root, '.agentsmesh', 'mcp.json'), '{"mcpServers":{}}');

    const out = await orchestrateHandlers.generate(ctx(), {});

    expect([out.skippedSettings, out.warnings]).toEqual([[], []]);
  });
});
