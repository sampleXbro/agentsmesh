/**
 * Failure-isolation contract for `runUninstall` (H1):
 *   - If `applyUninstall` throws for one pack mid-batch, subsequent packs
 *     still get a chance to apply.
 *   - The failing pack lands in `data.failed[]` with its error message.
 *   - Post-operation generate still runs over the packs that succeeded.
 *   - `exitCode` is 1 when any pack failed; 0 when all succeeded.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import { hashPackFiles } from '../../../../src/install/manifest/install-manifest-hash.js';
import { INSTALL_MANIFEST_FILENAME } from '../../../../src/install/manifest/install-manifest-hash.js';

import * as applyUninstallMod from '../../../../src/install/uninstall/apply-uninstall.js';
import * as postGenerateMod from '../../../../src/install/run/post-install-generate.js';

import { runUninstall } from '../../../../src/install/uninstall/run-uninstall.js';

let projectRoot = '';

function buildPack(name: string): void {
  const packsDir = join(projectRoot, '.agentsmesh', 'packs', name);
  mkdirSync(packsDir, { recursive: true });
  writeFileSync(join(packsDir, 'rules.md'), `# ${name}\n`);
}

async function writeManifest(name: string): Promise<void> {
  const packDir = join(projectRoot, '.agentsmesh', 'packs', name);
  const files = await hashPackFiles(packDir);
  writeFileSync(join(packDir, INSTALL_MANIFEST_FILENAME), JSON.stringify({ files }));
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'am-uninst-fail-'));
  mkdirSync(join(projectRoot, '.agentsmesh'), { recursive: true });
  writeFileSync(
    join(projectRoot, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules]\nextends: []\n',
  );
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('runUninstall — failure isolation (H1)', () => {
  it('continues after a mid-batch throw, records the failure, and exits 1', async () => {
    buildPack('alpha');
    buildPack('beta');
    buildPack('gamma');
    await writeManifest('alpha');
    await writeManifest('beta');
    await writeManifest('gamma');
    writeFileSync(
      join(projectRoot, '.agentsmesh', 'installs.yaml'),
      stringifyYaml({
        version: 1,
        installs: ['alpha', 'beta', 'gamma'].map((name) => ({
          name,
          source: `github:acme/${name}`,
          source_kind: 'github',
          features: ['rules'],
        })),
      }),
    );

    const realApply = applyUninstallMod.applyUninstall;
    const applySpy = vi.spyOn(applyUninstallMod, 'applyUninstall').mockImplementation((args) => {
      if (args.plan.name === 'beta') {
        return Promise.reject(new Error('EACCES: permission denied'));
      }
      return realApply(args);
    });

    const generateSpy = vi.spyOn(postGenerateMod, 'runPostOperationGenerate').mockResolvedValue([]);

    const result = await runUninstall({ all: true, force: true }, [], projectRoot);

    expect(applySpy).toHaveBeenCalledTimes(3);
    expect(result.exitCode).toBe(1);
    expect(result.data.removed.map((r) => r.name).sort()).toEqual(['alpha', 'gamma']);
    expect(result.data.failed).toEqual([{ name: 'beta', reason: 'EACCES: permission denied' }]);
    expect(result.data.skipped).toEqual([]);
    expect(result.data.dryRun).toBe(false);
    // Post-generate must still run because some packs survived.
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it('returns exitCode 0 and failed=[] when every pack applies cleanly', async () => {
    buildPack('alpha');
    await writeManifest('alpha');
    writeFileSync(
      join(projectRoot, '.agentsmesh', 'installs.yaml'),
      stringifyYaml({
        version: 1,
        installs: [
          {
            name: 'alpha',
            source: 'github:acme/alpha',
            source_kind: 'github',
            features: ['rules'],
          },
        ],
      }),
    );

    vi.spyOn(postGenerateMod, 'runPostOperationGenerate').mockResolvedValue([]);

    const result = await runUninstall({ force: true }, ['alpha'], projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data.failed).toEqual([]);
    expect(result.data.removed.map((r) => r.name)).toEqual(['alpha']);
  });

  it('reports a non-Error throw verbatim via String(err)', async () => {
    buildPack('alpha');
    await writeManifest('alpha');
    writeFileSync(
      join(projectRoot, '.agentsmesh', 'installs.yaml'),
      stringifyYaml({
        version: 1,
        installs: [
          {
            name: 'alpha',
            source: 'github:acme/alpha',
            source_kind: 'github',
            features: ['rules'],
          },
        ],
      }),
    );

    vi.spyOn(applyUninstallMod, 'applyUninstall').mockImplementation(() =>
      Promise.reject('plain-string failure'),
    );

    const result = await runUninstall({ force: true }, ['alpha'], projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data.failed).toEqual([{ name: 'alpha', reason: 'plain-string failure' }]);
    expect(result.data.removed).toEqual([]);
  });
});
