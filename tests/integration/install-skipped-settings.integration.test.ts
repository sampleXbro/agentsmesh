/**
 * Install results (CLI `--json` data and the MCP `install` tool) carry the
 * settings that the generate after install skipped from packs.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInstall } from '../../src/install/run/run-install.js';
import { installHandlers } from '../../src/mcp/handlers/install.js';
import { resolveContext } from '../../src/mcp/context.js';
import { logger } from '../../src/utils/output/logger.js';

const SKIPPED = [
  { feature: 'mcp', items: ['packsrv'] },
  { feature: 'permissions', items: ['allow Read'] },
  { feature: 'hooks', items: ['PreToolUse (1 hook)'] },
];

let base = '';
let project = '';
let pack = '';

function writeCanonical(dir: string, name: string, server?: string): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(join(dir, '.agentsmesh', 'rules', `${name}.md`), '---\ndescription: D\n---\n# D\n');
  if (server === undefined) return;
  writeFileSync(
    join(dir, '.agentsmesh', 'mcp.json'),
    JSON.stringify({ mcpServers: { [server]: { command: `${server}-cmd`, args: [] } } }),
  );
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'am-install-skipped-settings-'));
  vi.stubEnv('HOME', join(base, 'home'));
  vi.stubEnv('USERPROFILE', join(base, 'home'));
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  pack = join(base, 'pack');
  writeCanonical(pack, 'demo', 'packsrv');
  writeFileSync(join(pack, '.agentsmesh', 'permissions.yaml'), 'allow:\n  - Read\n');
  writeFileSync(
    join(pack, '.agentsmesh', 'hooks.yaml'),
    'PreToolUse:\n  - matcher: Bash\n    command: echo pack\n',
  );
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(project, '.agentsmesh', 'rules', '_root.md'),
    '---\nroot: true\n---\n# Root\n',
  );
  writeFileSync(
    join(project, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, mcp, permissions, hooks]\nextends: []\n',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe('install results — skippedSettings', () => {
  it('lists what the generate after install skipped', async () => {
    const { data } = await runInstall({ force: true, name: 'p' }, [pack], project);

    expect(data.skippedSettings).toEqual(SKIPPED);
  });

  it('is in the MCP install result', async () => {
    const ctx = await resolveContext({ cwd: project });

    const out = await installHandlers.install(ctx, { source: pack, name: 'p' });

    expect(out.skippedSettings).toEqual(SKIPPED);
  });

  it('is in the sync result when sync reinstalls a pack', async () => {
    await runInstall({ force: true, name: 'p' }, [pack], project);
    const noop = await runInstall({ sync: true, force: true }, [], project);
    rmSync(join(project, '.agentsmesh', 'packs'), { recursive: true });

    const { data } = await runInstall({ sync: true, force: true }, [], project);

    expect(noop.data).not.toHaveProperty('skippedSettings');
    expect([data.mode, data.skippedSettings]).toEqual(['sync', SKIPPED]);
  });

  it('lists what the last generate skipped across marketplace sub-packs', async () => {
    const market = join(base, 'market');
    mkdirSync(join(market, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(market, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ plugins: [{ source: 'plugins/alpha' }, { source: 'plugins/beta' }] }),
    );
    writeCanonical(join(market, 'plugins', 'alpha'), 'alpha');
    writeCanonical(join(market, 'plugins', 'beta'), 'beta', 'betasrv');

    const { data } = await runInstall({ force: true, all: true }, [market], project);

    expect(data.skippedSettings).toEqual([{ feature: 'mcp', items: ['betasrv'] }]);
  });

  it('is left out for a dry run, which runs no generate', async () => {
    const { data } = await runInstall({ force: true, 'dry-run': true, name: 'p' }, [pack], project);

    expect(data).not.toHaveProperty('skippedSettings');
  });

  it('is left out when the local files manage every setting', async () => {
    writeFileSync(join(project, '.agentsmesh', 'mcp.json'), '{"mcpServers":{}}');
    writeFileSync(join(project, '.agentsmesh', 'permissions.yaml'), 'allow: []\n');
    writeFileSync(join(project, '.agentsmesh', 'hooks.yaml'), '{}\n');

    const { data } = await runInstall({ force: true, name: 'p' }, [pack], project);

    expect(data).not.toHaveProperty('skippedSettings');
  });
});
