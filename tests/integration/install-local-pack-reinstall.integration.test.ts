/**
 * Re-installing a changed local pack updates it in place, like `refresh`.
 *
 * A source that drops a whole feature (here `commands/`) used to fail with
 * "Auto-generated pack name … collides" when re-run with the same `--name`,
 * and without `--name` it created a second pack from the same source that
 * kept generating the removed command. Packs split on purpose (a picked
 * subset, another `--as`) are not affected.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readInstallManifest } from '../../src/install/core/install-manifest.js';
import { runInstall } from '../../src/install/run/run-install.js';
import { logger } from '../../src/utils/output/logger.js';

let root: string;
let project: string;
let source: string;

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function buildSource(dir: string): void {
  write(join(dir, 'rules', 'r1.md'), '---\ndescription: R one.\n---\nRule one.\n');
  write(join(dir, 'commands', 'c1.md'), '---\ndescription: C one.\n---\nCommand one.\n');
  write(join(dir, 'agents', 'a1.md'), '---\nname: a1\ndescription: Agent one.\n---\nAgent.\n');
  write(join(dir, 'skills', 's1', 'SKILL.md'), '---\nname: s1\ndescription: Skill one.\n---\nS.\n');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-local-reinstall-'));
  project = join(root, 'project');
  source = join(root, 'packc');
  buildSource(source);
  write(
    join(project, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, commands, agents, skills]\nextends: []\n',
  );
  write(join(project, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const packsDir = (): string => join(project, '.agentsmesh', 'packs');

async function manifestFeatures(): Promise<Record<string, readonly string[]>> {
  const entries = await readInstallManifest(join(project, '.agentsmesh'));
  return Object.fromEntries(entries.map((e) => [e.name, [...e.features].sort()]));
}

describe('re-installing a changed local pack', () => {
  it('updates the named pack in place when the source drops a feature', async () => {
    await runInstall({ force: true, name: 'localpack' }, [source], project);
    rmSync(join(source, 'commands'), { recursive: true });

    await runInstall({ force: true, name: 'localpack' }, [source], project);

    expect(readdirSync(packsDir())).toEqual(['localpack']);
    expect(existsSync(join(packsDir(), 'localpack', 'commands'))).toBe(false);
    expect(await manifestFeatures()).toEqual({ localpack: ['agents', 'rules', 'skills'] });
  });

  it('updates the existing pack without --name instead of adding a second one', async () => {
    await runInstall({ force: true, name: 'localpack' }, [source], project);
    rmSync(join(source, 'commands'), { recursive: true });

    await runInstall({ force: true }, [source], project);

    expect(readdirSync(packsDir())).toEqual(['localpack']);
    expect(existsSync(join(packsDir(), 'localpack', 'commands'))).toBe(false);
    expect(await manifestFeatures()).toEqual({ localpack: ['agents', 'rules', 'skills'] });
  });

  it('keeps the pack name on a same-feature re-install without --name', async () => {
    await runInstall({ force: true, name: 'localpack' }, [source], project);
    rmSync(join(source, 'agents', 'a1.md'));
    write(join(source, 'agents', 'a2.md'), '---\nname: a2\ndescription: Agent two.\n---\nA.\n');

    const result = await runInstall({ force: true }, [source], project);

    expect(readdirSync(packsDir())).toEqual(['localpack']);
    expect(readdirSync(join(packsDir(), 'localpack', 'agents'))).toEqual(['a2.md']);
    expect(await manifestFeatures()).toEqual({
      localpack: ['agents', 'commands', 'rules', 'skills'],
    });
    expect(new Set(result.data.installed.map((i) => i.path))).toEqual(new Set(['localpack']));
  });

  it('names the pack it would update on a --dry-run re-install, and writes nothing', async () => {
    await runInstall({ force: true, name: 'localpack' }, [source], project);
    rmSync(join(source, 'commands'), { recursive: true });
    const info = vi.spyOn(logger, 'info');

    await runInstall({ force: true, 'dry-run': true }, [source], project);

    const dryRun = info.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.startsWith('[dry-run]'));
    expect(dryRun).toEqual(['[dry-run] Would install pack "localpack" to .agentsmesh/packs/.']);
    expect(readdirSync(packsDir())).toEqual(['localpack']);
    expect(existsSync(join(packsDir(), 'localpack', 'commands'))).toBe(true);
  });

  it('drops a removed rule on a same-feature re-install, like refresh', async () => {
    write(join(source, 'rules', 'r2.md'), '---\ndescription: R two.\n---\nRule two.\n');
    await runInstall({ force: true, name: 'localpack' }, [source], project);
    rmSync(join(source, 'rules', 'r2.md'));

    await runInstall({ force: true, name: 'localpack' }, [source], project);

    expect(readdirSync(join(packsDir(), 'localpack', 'rules'))).toEqual(['r1.md']);
  });

  it('refuses --name that belongs to a pack from another source, and says so', async () => {
    const other = join(root, 'other');
    buildSource(other);
    await runInstall({ force: true, name: 'shared' }, [source], project);

    const attempt = runInstall({ force: true, name: 'shared' }, [other], project);

    await expect(attempt).rejects.toThrow(/"shared" already exists from another source/);
    expect(readdirSync(packsDir())).toEqual(['shared']);
  });
});
