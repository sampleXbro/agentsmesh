/**
 * A pack or extend that ships MCP servers must not wipe the servers a user
 * already has in a tool while their own mcp.json leaves MCP unmanaged.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../../src/cli/commands/init.js';
import { runInstall } from '../../src/install/run/run-install.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { runImport } from '../../src/cli/commands/import.js';
import { logger } from '../../src/utils/output/logger.js';

const ROOT = join(tmpdir(), 'am-install-mcp-unmanaged-integration');
const HOME = join(ROOT, 'home');
const WORKSPACE = join(ROOT, 'workspace');
const PACK = join(ROOT, 'pack');

const MINE = { type: 'stdio', command: 'mine-cmd', args: ['--mine'] };
const CUR = { command: 'cur-cmd', args: [] };
const PACKSRV = { type: 'stdio', command: 'pack-cmd', args: [], env: {} };
const SKIPPED_WARNING =
  '[agentsmesh] Skipped MCP servers from installed packs or extends: packsrv. ' +
  'Your own mcp.json has no "mcpServers" key, so AgentsMesh leaves the MCP servers in your tools alone. ' +
  'To use these servers, run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh) ' +
  'to copy in the servers your tools already have, or list them under "mcpServers" in mcp.json, then generate again.';

let warn: MockInstance<typeof logger.warn>;

function skippedWarnings(): unknown[][] {
  return warn.mock.calls.filter(([msg]) => String(msg).includes('Skipped MCP servers'));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function servers(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers?: Record<string, unknown> };
  return parsed.mcpServers ?? {};
}

function writePack(dir: string): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(dir, '.agentsmesh', 'rules', 'demo.md'),
    '---\ndescription: Demo rule\n---\n# Demo\n',
  );
  writeJson(join(dir, '.agentsmesh', 'mcp.json'), {
    mcpServers: { packsrv: { command: 'pack-cmd', args: [] } },
  });
}

describe('MCP servers from packs and extends while canonical MCP is unmanaged', () => {
  beforeEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(WORKSPACE, { recursive: true });
    writePack(PACK);
    vi.stubEnv('HOME', HOME);
    vi.stubEnv('USERPROFILE', HOME);
    warn = vi.spyOn(logger, 'warn');
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
    rmSync(ROOT, { recursive: true, force: true });
  });

  it('install --global keeps the servers a user has in their tools', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code', 'cursor'] });
    writeJson(join(HOME, '.claude.json'), { mcpServers: { mine: MINE } });
    mkdirSync(join(HOME, '.cursor'), { recursive: true });
    writeJson(join(HOME, '.cursor', 'mcp.json'), { mcpServers: { cur: CUR } });

    await runInstall({ global: true, force: true, name: 'mcp-pack' }, [PACK], WORKSPACE);

    expect(servers(join(HOME, '.claude.json'))).toEqual({ mine: MINE });
    expect(servers(join(HOME, '.cursor', 'mcp.json'))).toEqual({ cur: CUR });
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
    expect(
      readFileSync(join(HOME, '.agentsmesh', 'packs', 'mcp-pack', 'mcp.json'), 'utf8'),
    ).toContain('packsrv');
  });

  it('import --global opts in: the pack servers join the servers the tools had', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code', 'cursor'] });
    writeJson(join(HOME, '.claude.json'), { mcpServers: { mine: MINE } });
    mkdirSync(join(HOME, '.cursor'), { recursive: true });
    writeJson(join(HOME, '.cursor', 'mcp.json'), { mcpServers: { cur: CUR } });
    await runInstall({ global: true, force: true, name: 'mcp-pack' }, [PACK], WORKSPACE);

    await runImport({ from: 'claude-code', global: true }, WORKSPACE);
    await runImport({ from: 'cursor', global: true }, WORKSPACE);
    await runGenerate({ global: true }, WORKSPACE, { printMatrix: false });

    const all = {
      mine: { ...MINE, env: {} },
      cur: { type: 'stdio', ...CUR, env: {} },
      packsrv: PACKSRV,
    };
    expect(servers(join(HOME, '.claude.json'))).toEqual(all);
    expect(servers(join(HOME, '.cursor', 'mcp.json'))).toEqual(all);
  });

  it('a local extend keeps the servers a user has in their tools (global)', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code'] });
    const configPath = join(HOME, '.agentsmesh', 'agentsmesh.yaml');
    const extend = `extends:\n  - name: base\n    source: ${JSON.stringify(PACK)}\n    features: [mcp]\n`;
    writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}${extend}`);
    writeJson(join(HOME, '.claude.json'), { mcpServers: { mine: MINE } });

    await runGenerate({ global: true }, WORKSPACE, { printMatrix: false });

    expect(servers(join(HOME, '.claude.json'))).toEqual({ mine: MINE });
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });

  it('project install keeps the servers in a hand-written .mcp.json', async () => {
    const project = join(ROOT, 'project');
    mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(project, 'agentsmesh.yaml'),
      'version: 1\ntargets: [claude-code]\nfeatures: [rules, skills, mcp]\nextends: []\n',
    );
    writeFileSync(join(project, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# R\n');
    writeJson(join(project, '.mcp.json'), { mcpServers: { mine: MINE } });

    await runInstall({ force: true, name: 'mcp-pack' }, [PACK], project);

    expect(servers(join(project, '.mcp.json'))).toEqual({ mine: MINE });
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });

  it('project install still adds pack servers to a managed mcp.json', async () => {
    const project = join(ROOT, 'project');
    mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(project, 'agentsmesh.yaml'),
      'version: 1\ntargets: [claude-code]\nfeatures: [rules, skills, mcp]\nextends: []\n',
    );
    writeFileSync(join(project, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# R\n');
    writeJson(join(project, '.agentsmesh', 'mcp.json'), { mcpServers: { mine: MINE } });

    await runInstall({ force: true, name: 'mcp-pack' }, [PACK], project);

    expect(servers(join(project, '.mcp.json'))).toEqual({
      mine: { ...MINE, env: {} },
      packsrv: PACKSRV,
    });
    expect(skippedWarnings()).toEqual([]);
  });

  it('warns once when another install runs with the MCP pack already installed', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code'] });
    await runInstall({ global: true, force: true, name: 'p' }, [PACK], WORKSPACE);
    const rulesOnly = join(ROOT, 'rules-pack');
    mkdirSync(join(rulesOnly, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(rulesOnly, '.agentsmesh', 'rules', 'other.md'),
      '---\ndescription: Other rule\n---\n# Other\n',
    );
    warn.mockClear();

    await runInstall({ global: true, force: true, name: 'q' }, [rulesOnly], WORKSPACE);

    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });
});
