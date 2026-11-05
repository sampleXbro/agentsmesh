/**
 * A merge into an installed pack must keep its install manifest current:
 * agentsmesh's own writes never show as local edits to refresh or uninstall,
 * while edits made before the merge still do.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInstall } from '../../src/install/run/run-install.js';
import { runRefresh } from '../../src/install/refresh/run-refresh.js';
import { runConsentPrompt } from '../../src/install/refresh/refresh-prompt.js';
import { runUninstall } from '../../src/install/uninstall/run-uninstall.js';
import { detectModifiedFiles } from '../../src/install/uninstall/detect-modified.js';
import { hashPackFiles } from '../../src/install/manifest/install-manifest-hash.js';
import { logger } from '../../src/utils/output/logger.js';

vi.mock('../../src/install/refresh/refresh-prompt.js', () => ({
  runConsentPrompt: vi.fn(async (items: readonly { name: string }[]) => ({
    proceed: false,
    perPack: false,
    declined: items.map((i) => i.name),
  })),
}));

const MARKET_PACK = 'source-plugins-alpha';
const PICK_PACK = 'source-rules';

let base = '';
let project = '';
let market = '';
let source = '';

const rule = (name: string, body = '# D'): string => `---\ndescription: ${name}\n---\n${body}\n`;

function writeSubPack(name: string): void {
  const dir = join(market, 'plugins', name, '.agentsmesh');
  mkdirSync(join(dir, 'rules'), { recursive: true });
  writeFileSync(join(dir, 'rules', `${name}.md`), rule(name));
  writeFileSync(
    join(dir, 'mcp.json'),
    JSON.stringify({ mcpServers: { [`${name}srv`]: { command: `${name}-cmd`, args: [] } } }),
  );
}

function packDir(name: string): string {
  return join(project, '.agentsmesh', 'packs', name);
}

function readManifest(name: string): { files: Record<string, string> } {
  const raw = readFileSync(join(packDir(name), '.agentsmesh-install-manifest.json'), 'utf8');
  return JSON.parse(raw) as { files: Record<string, string> };
}

async function installPick(name: string): Promise<void> {
  const replay = { features: ['rules' as const], pick: { rules: [name] } };
  const { exitCode } = await runInstall({ force: true }, [source], project, replay);
  expect(exitCode).toBe(0);
}

async function expectCleanManifest(name: string, from: string, files: string[]): Promise<void> {
  const manifest = readManifest(name);
  const meta = parseYaml(readFileSync(join(packDir(name), 'pack.yaml'), 'utf8')) as {
    installed_at: string;
  };
  expect(manifest).toEqual({
    $schema: expect.stringMatching(/\/schemas\/install-manifest\.json$/),
    name,
    source: from,
    installed_at: meta.installed_at,
    extends_id: null,
    source_type: 'canonical-agentsmesh',
    files: await hashPackFiles(packDir(name)),
  });
  expect(Object.keys(manifest.files)).toEqual(files);
  expect(await detectModifiedFiles(packDir(name), manifest.files)).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  base = mkdtempSync(join(tmpdir(), 'am-merge-manifest-'));
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
  source = join(base, 'source');
  mkdirSync(join(source, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(join(source, '.agentsmesh', 'rules', 'alpha.md'), rule('alpha'));
  writeFileSync(join(source, '.agentsmesh', 'rules', 'beta.md'), rule('beta'));
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(join(project, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# R\n');
  writeFileSync(join(project, '.agentsmesh', 'mcp.json'), '{"mcpServers":{}}');
  writeFileSync(
    join(project, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, mcp]\nextends: []\n',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe('merging into an installed pack keeps its install manifest current', () => {
  it('records the files of every sub-pack of a marketplace --all install', async () => {
    const { exitCode } = await runInstall({ force: true, all: true }, [market], project);

    expect(exitCode).toBe(0);
    await expectCleanManifest(MARKET_PACK, '../market', [
      'mcp.json',
      'rules/alpha.md',
      'rules/beta.md',
    ]);
  });

  it('records the files of every replayed path on install --sync', async () => {
    await runInstall({ force: true, all: true }, [market], project);
    rmSync(join(project, '.agentsmesh', 'packs'), { recursive: true });

    const { exitCode } = await runInstall({ sync: true, force: true }, [], project);

    expect(exitCode).toBe(0);
    await expectCleanManifest(MARKET_PACK, '../market', [
      'mcp.json',
      'rules/alpha.md',
      'rules/beta.md',
    ]);
  });

  it('uninstall finds no modified files in a freshly merged pack', async () => {
    await runInstall({ force: true, all: true }, [market], project);

    const flags = { force: true, 'dry-run': true };
    const { exitCode, data } = await runUninstall(flags, [MARKET_PACK], project);

    expect(exitCode).toBe(0);
    expect(data.removed.map((r) => [r.name, r.modified_files_kept])).toEqual([[MARKET_PACK, []]]);
  });

  it('still reports the edits made before a picked subset merged in', async () => {
    await installPick('alpha');
    writeFileSync(join(packDir(PICK_PACK), 'rules', 'alpha.md'), '# my edit\n');
    writeFileSync(join(packDir(PICK_PACK), 'notes.md'), '# notes\n');

    await installPick('beta');

    const manifest = readManifest(PICK_PACK);
    expect(Object.keys(manifest.files)).toEqual(['rules/alpha.md', 'rules/beta.md']);
    expect(await detectModifiedFiles(packDir(PICK_PACK), manifest.files)).toEqual([
      { relativePath: 'notes.md', status: 'added' },
      { relativePath: 'rules/alpha.md', status: 'modified' },
    ]);
  });

  it('refresh without --force updates a freshly merged pack without asking', async () => {
    await installPick('alpha');
    await installPick('beta');
    await expectCleanManifest(PICK_PACK, '../source', ['rules/alpha.md', 'rules/beta.md']);
    writeFileSync(join(source, '.agentsmesh', 'rules', 'alpha.md'), rule('alpha', '# v2'));

    const { exitCode, data } = await runRefresh({}, [], project);

    expect(runConsentPrompt).not.toHaveBeenCalled();
    expect([
      exitCode,
      data.refreshed.map((r) => [r.name, r.oldSha, r.newSha]),
      data.unchanged,
      data.skipped,
      data.failed,
    ]).toEqual([0, [[PICK_PACK, null, 'local']], [], [], []]);
    expect(readFileSync(join(packDir(PICK_PACK), 'rules', 'alpha.md'), 'utf8')).toBe(
      rule('alpha', '# v2'),
    );
    await expectCleanManifest(PICK_PACK, '../source', ['rules/alpha.md', 'rules/beta.md']);
  });
});
