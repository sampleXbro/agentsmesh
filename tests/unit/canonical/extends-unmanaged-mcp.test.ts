/**
 * Packs and extends add MCP servers only to a list the user manages in their
 * own mcp.json. Without a local "mcpServers" key, their servers are dropped
 * so generate leaves the servers already in the tools alone.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { loadCanonicalWithExtends } from '../../../src/canonical/extends/extends.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import { logger } from '../../../src/utils/output/logger.js';
import { TEMPLATE_MCP_GLOBAL } from '../../../src/cli/commands/init-mcp-templates.js';

const SKIPPED_WARNING =
  '[agentsmesh] Skipped MCP servers from installed packs or extends: ext-srv, pack-srv. ' +
  'Your own mcp.json has no "mcpServers" key, so AgentsMesh does not write them to your tools: your tools keep their own servers, ' +
  'and a file AgentsMesh wrote only from them is removed. ' +
  'To use them, list your servers under "mcpServers" in mcp.json, or run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh) ' +
  'to copy in the servers your tools already have, then generate again.';

let base: string;
let project: string;
let warn: MockInstance<typeof logger.warn>;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'amesh-unmanaged-mcp-'));
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh'), { recursive: true });
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  rmSync(base, { recursive: true, force: true });
});

const server = (command: string): unknown => ({ command, args: [] });
const parsed = (command: string): unknown => ({ type: 'stdio', command, args: [], env: {} });

function mcpAt(dir: string, servers: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: servers }));
}

function packAt(name: string, servers: Record<string, unknown>): void {
  const dir = join(project, '.agentsmesh', 'packs', name);
  mcpAt(dir, servers);
  writeFileSync(
    join(dir, 'pack.yaml'),
    [
      `name: ${name}`,
      'source: ../pack-source',
      'source_kind: local',
      'installed_at: "2026-03-22T10:00:00Z"',
      'updated_at: "2026-03-22T10:00:00Z"',
      'content_hash: sha256:aabbcc',
      'features:',
      '  - mcp',
    ].join('\n'),
  );
}

function withLayers(): ValidatedConfig {
  mcpAt(join(base, 'shared', '.agentsmesh'), { 'ext-srv': server('ext-cmd') });
  packAt('mcp-pack', { 'pack-srv': server('pack-cmd') });
  return {
    version: 1,
    targets: ['claude-code'],
    features: ['mcp'],
    extends: [{ name: 'base', source: join('..', 'shared'), features: ['mcp'] }],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    plugins: [],
    pluginTargets: [],
  };
}

async function loadMcp(config: ValidatedConfig): Promise<unknown> {
  const { canonical } = await loadCanonicalWithExtends(config, project);
  return canonical.mcp;
}

describe('MCP servers from packs and extends need a local "mcpServers" key', () => {
  it('drops them and warns when there is no local mcp.json', async () => {
    expect(await loadMcp(withLayers())).toBeNull();
    expect(warn.mock.calls).toEqual([[SKIPPED_WARNING]]);
  });

  it('drops them when the local mcp.json has "mcpServers" commented out', async () => {
    const config = withLayers();
    writeFileSync(join(project, '.agentsmesh', 'mcp.json'), TEMPLATE_MCP_GLOBAL);
    expect(await loadMcp(config)).toBeNull();
    expect(warn.mock.calls).toEqual([[SKIPPED_WARNING]]);
  });

  it('drops an empty pack list without a warning', async () => {
    packAt('empty-pack', {});
    const config: ValidatedConfig = { ...withLayers(), extends: [] };
    rmSync(join(project, '.agentsmesh', 'packs', 'mcp-pack'), { recursive: true });
    expect(await loadMcp(config)).toBeNull();
    expect(warn.mock.calls).toEqual([]);
  });

  it('drops them without a warning when the mcp feature is off', async () => {
    const config: ValidatedConfig = { ...withLayers(), features: ['rules'] };
    expect(await loadMcp(config)).toBeNull();
    expect(warn.mock.calls).toEqual([]);
  });

  it('adds them to an empty local "mcpServers" list', async () => {
    const config = withLayers();
    mcpAt(join(project, '.agentsmesh'), {});
    expect(await loadMcp(config)).toEqual({
      mcpServers: { 'ext-srv': parsed('ext-cmd'), 'pack-srv': parsed('pack-cmd') },
    });
    expect(warn.mock.calls).toEqual([]);
  });

  it('adds them to local servers, and a local server wins on the same name', async () => {
    const config = withLayers();
    mcpAt(join(project, '.agentsmesh'), {
      mine: server('mine-cmd'),
      'pack-srv': server('local-cmd'),
    });
    expect(await loadMcp(config)).toEqual({
      mcpServers: {
        'ext-srv': parsed('ext-cmd'),
        'pack-srv': parsed('local-cmd'),
        mine: parsed('mine-cmd'),
      },
    });
    expect(warn.mock.calls).toEqual([]);
  });
});
