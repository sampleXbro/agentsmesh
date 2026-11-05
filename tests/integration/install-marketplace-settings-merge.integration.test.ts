/**
 * A marketplace `--all` install folds sub-packs from one source into one pack.
 * Every sub-pack's MCP servers, permissions, hooks and ignore patterns must
 * stay in that pack and in the generated files, also after sync and refresh.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInstall } from '../../src/install/run/run-install.js';
import { runRefresh } from '../../src/install/refresh/run-refresh.js';
import { readInstallManifest } from '../../src/install/core/install-manifest.js';
import { logger } from '../../src/utils/output/logger.js';

const PACK = 'source-plugins-alpha';
const PACK_FILES = [
  '.agentsmesh-install-manifest.json',
  'hooks.yaml',
  'ignore',
  'mcp.json',
  'pack.yaml',
  'permissions.yaml',
  'rules',
  'rules/alpha.md',
  'rules/beta.md',
];

let base = '';
let project = '';
let market = '';

const server = (cmd: string): object => ({ type: 'stdio', command: cmd, args: [], env: {} });

function writeSubPack(name: string, serverName = `${name}srv`): void {
  const dir = join(market, 'plugins', name, '.agentsmesh');
  mkdirSync(join(dir, 'rules'), { recursive: true });
  writeFileSync(join(dir, 'rules', `${name}.md`), '---\ndescription: D\n---\n# D\n');
  writeFileSync(
    join(dir, 'mcp.json'),
    JSON.stringify({ mcpServers: { [serverName]: { command: `${name}-cmd`, args: [] } } }),
  );
  writeFileSync(join(dir, 'permissions.yaml'), `allow:\n  - Read(${name})\n`);
  writeFileSync(
    join(dir, 'hooks.yaml'),
    `PreToolUse:\n  - matcher: Bash\n    command: echo ${name}\n`,
  );
  writeFileSync(join(dir, 'ignore'), `${name}-secret\n`);
}

function read(...parts: string[]): string {
  return readFileSync(join(project, ...parts), 'utf8');
}

function packFile(file: string): string {
  return read('.agentsmesh', 'packs', PACK, file);
}

function expectBothSubPacks(alphaServer = 'alphasrv', betaServer = 'betasrv'): void {
  const packs = join(project, '.agentsmesh', 'packs');
  expect(readdirSync(packs)).toEqual([PACK]);
  const files = readdirSync(join(packs, PACK), { recursive: true }).map((f) =>
    String(f).replaceAll('\\', '/'),
  );
  expect(files.sort()).toEqual(PACK_FILES);
  const servers = { [alphaServer]: server('alpha-cmd'), [betaServer]: server('beta-cmd') };
  expect(JSON.parse(packFile('mcp.json'))).toEqual({ mcpServers: servers });
  expect(parseYaml(packFile('permissions.yaml'))).toEqual({ allow: ['Read(alpha)', 'Read(beta)'] });
  expect(parseYaml(packFile('hooks.yaml'))).toEqual({
    PreToolUse: [
      { matcher: 'Bash', command: 'echo alpha' },
      { matcher: 'Bash', command: 'echo beta' },
    ],
  });
  expect(packFile('ignore')).toBe('alpha-secret\nbeta-secret\n');

  expect(JSON.parse(read('.mcp.json'))).toEqual({ mcpServers: servers });
  const settings = JSON.parse(read('.claude', 'settings.json')) as Record<string, unknown>;
  expect(settings).toEqual({
    permissions: { allow: ['Read(alpha)', 'Read(beta)'] },
    hooks: {
      PreToolUse: ['alpha', 'beta'].map((name) => ({
        matcher: 'Bash',
        hooks: [{ type: 'command', command: `echo ${name}` }],
      })),
    },
  });
  expect(read('.claudeignore')).toBe('alpha-secret\nbeta-secret\nlocal');
}

async function expectOneManifestEntry(): Promise<void> {
  const installs = await readInstallManifest(join(project, '.agentsmesh'));
  expect(installs.map((e) => [e.name, e.path, e.paths])).toEqual([
    [PACK, undefined, ['plugins/alpha', 'plugins/beta']],
  ]);
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'am-mp-settings-'));
  vi.stubEnv('HOME', join(base, 'home'));
  vi.stubEnv('USERPROFILE', join(base, 'home'));
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  market = join(base, 'market');
  mkdirSync(join(market, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(market, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ plugins: [{ source: 'plugins/alpha' }, { source: 'plugins/beta' }] }),
  );
  writeSubPack('alpha');
  writeSubPack('beta');
  project = join(base, 'project');
  const canonical = join(project, '.agentsmesh');
  mkdirSync(join(canonical, 'rules'), { recursive: true });
  writeFileSync(join(canonical, 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
  writeFileSync(join(canonical, 'mcp.json'), '{"mcpServers":{}}');
  writeFileSync(join(canonical, 'permissions.yaml'), 'allow: []\n');
  writeFileSync(join(canonical, 'hooks.yaml'), '{}\n');
  writeFileSync(join(canonical, 'ignore'), 'local\n');
  writeFileSync(
    join(project, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, mcp, permissions, hooks, ignore]\nextends: []\n',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe('marketplace install — settings from every sub-pack', () => {
  it('keeps the first sub-pack settings when a later sub-pack merges into the pack', async () => {
    const { exitCode } = await runInstall({ force: true, all: true }, [market], project);

    expect(exitCode).toBe(0);
    expectBothSubPacks();
    await expectOneManifestEntry();
  });

  it('rebuilds every sub-pack settings on install --sync', async () => {
    await runInstall({ force: true, all: true }, [market], project);
    rmSync(join(project, '.agentsmesh', 'packs'), { recursive: true });

    const { exitCode } = await runInstall({ sync: true, force: true }, [], project);

    expect(exitCode).toBe(0);
    expectBothSubPacks();
    await expectOneManifestEntry();
  });

  it('refresh rebuilds the one pack from every sub-pack, without stale settings', async () => {
    await runInstall({ force: true, all: true }, [market], project);
    rmSync(join(market, 'plugins'), { recursive: true });
    writeSubPack('alpha', 'alphasrv2');
    writeSubPack('beta', 'betasrv2');

    const { exitCode, data } = await runRefresh({ force: true }, [], project);

    expect([exitCode, data.refreshed.map((r) => r.name), data.failed]).toEqual([0, [PACK], []]);
    expectBothSubPacks('alphasrv2', 'betasrv2');
    await expectOneManifestEntry();
  });
});
