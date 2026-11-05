/**
 * A marketplace (`paths: [...]`) refresh re-enters the install pipeline once
 * per recorded path. Every call must carry the refresh bridge's replay scope
 * (the recorded `original_ref` branch pin); otherwise every sub-pack re-records
 * `original_ref` as the resolved SHA and every later refresh becomes a no-op
 * "unchanged". Only the first path materializes fresh; the rest merge in.
 *
 * Drives the real bridge → runInstall → picker → sub-install chain and
 * observes the `installAsPack` boundary, mirroring `flag-propagation.test.ts`.
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallManifestEntry } from '../../../../src/install/core/install-manifest.js';

const mocks = vi.hoisted(() => ({
  installAsPack: vi.fn(),
  runPostOperationGenerate: vi.fn(),
  resolveInstallResolvedPath: vi.fn(),
  isGitAvailable: vi.fn(),
}));

vi.mock('../../../../src/install/run/run-install-pack.js', () => ({
  installAsPack: mocks.installAsPack,
}));

vi.mock('../../../../src/install/run/post-install-generate.js', () => ({
  runPostOperationGenerate: mocks.runPostOperationGenerate,
}));

vi.mock('../../../../src/install/run/run-install-resolve.js', () => ({
  resolveInstallResolvedPath: mocks.resolveInstallResolvedPath,
}));

vi.mock('../../../../src/install/source/git-pin.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/install/source/git-pin.js')>();
  return { ...actual, isGitAvailable: mocks.isGitAvailable };
});

import { createRunInstallForRefresh } from '../../../../src/install/refresh/refresh-install-bridge.js';

const SUB_PACKS = ['plugins/a', 'plugins/b'];

describe('refresh of a marketplace install keeps the branch pin', () => {
  let projectRoot: string;
  let contentRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectRoot = await mkdtemp(join(tmpdir(), 'am-'));
    await mkdir(join(projectRoot, '.agentsmesh', 'packs'), { recursive: true });
    await writeFile(join(projectRoot, 'agentsmesh.yaml'), 'version: 1\n');

    contentRoot = await mkdtemp(join(tmpdir(), 'am-'));
    await mkdir(join(contentRoot, '.claude-plugin'), { recursive: true });
    await writeFile(
      join(contentRoot, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ plugins: SUB_PACKS.map((source) => ({ name: source, source })) }),
    );
    for (const sub of SUB_PACKS) {
      const skillDir = join(contentRoot, sub, 'skills', 'my-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        '---\nname: my-skill\ndescription: test\n---\n# My Skill\n',
      );
    }

    mocks.resolveInstallResolvedPath.mockResolvedValue({
      resolvedPath: contentRoot,
      sourceForYaml: 'github:org/repo@newsha',
      version: 'newsha',
    });
    mocks.isGitAvailable.mockResolvedValue(true);
    mocks.runPostOperationGenerate.mockResolvedValue(undefined);
    mocks.installAsPack.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(contentRoot, { recursive: true, force: true });
  });

  it('every sub-pack re-install records original_ref: main; only the first materializes fresh', async () => {
    const entry: InstallManifestEntry = {
      name: 'mp-pack',
      source: 'github:org/repo@oldsha',
      source_kind: 'github',
      version: 'oldsha',
      features: ['skills'],
      paths: SUB_PACKS,
      original_ref: 'main',
    };

    await createRunInstallForRefresh({ projectRoot, scope: 'project' })(entry, 'newsha');

    expect(mocks.installAsPack).toHaveBeenCalledTimes(SUB_PACKS.length);
    const calls = mocks.installAsPack.mock.calls.map(
      (call) =>
        call[0] as { pathInRepo?: string; originalRef?: string; forceFreshMaterialize?: boolean },
    );
    expect(calls.map((c) => [c.pathInRepo, c.originalRef, c.forceFreshMaterialize])).toEqual([
      ['plugins/a', 'main', true],
      ['plugins/b', 'main', false],
    ]);
  });
});
