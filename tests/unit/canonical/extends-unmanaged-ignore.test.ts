/**
 * Packs and extends add ignore patterns only to a list the user manages in
 * their own .agentsmesh/ignore. While it has no patterns, theirs are dropped
 * so generate leaves the ignore files already in the tools alone.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { loadCanonicalWithExtends } from '../../../src/canonical/extends/extends.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import { logger } from '../../../src/utils/output/logger.js';
import { TEMPLATE_IGNORE } from '../../../src/cli/commands/init-templates.js';

const SKIPPED_WARNING =
  '[agentsmesh] Skipped ignore patterns from installed packs or extends: ext-dir/, pack-dir/. ' +
  'Your own ignore file (.agentsmesh/ignore, or ~/.agentsmesh/ignore with --global) has no patterns, ' +
  'so AgentsMesh leaves the ignore files in your tools alone. ' +
  'To use these patterns, run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh) ' +
  'to copy in the patterns your tools already have, ' +
  'or add the patterns you want to your own ignore file, then generate again.';

let base: string;
let project: string;
let warn: MockInstance<typeof logger.warn>;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'amesh-unmanaged-ignore-'));
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh'), { recursive: true });
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  rmSync(base, { recursive: true, force: true });
});

function ignoreAt(dir: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ignore'), content);
}

function packAt(name: string, content: string): void {
  const dir = join(project, '.agentsmesh', 'packs', name);
  ignoreAt(dir, content);
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
      '  - ignore',
    ].join('\n'),
  );
}

function withLayers(): ValidatedConfig {
  ignoreAt(join(base, 'shared', '.agentsmesh'), 'ext-dir/\n');
  packAt('ignore-pack', 'pack-dir/\n');
  return {
    version: 1,
    targets: ['claude-code'],
    features: ['ignore'],
    extends: [{ name: 'base', source: join('..', 'shared'), features: ['ignore'] }],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    plugins: [],
    pluginTargets: [],
  };
}

async function loadIgnore(config: ValidatedConfig): Promise<string[]> {
  const { canonical } = await loadCanonicalWithExtends(config, project);
  return canonical.ignore;
}

describe('ignore patterns from packs and extends need local patterns', () => {
  it('drops them and warns when there is no local ignore file', async () => {
    expect(await loadIgnore(withLayers())).toEqual([]);
    expect(warn.mock.calls).toEqual([[SKIPPED_WARNING]]);
  });

  it('drops them when the local ignore file has only comments', async () => {
    const config = withLayers();
    ignoreAt(join(project, '.agentsmesh'), TEMPLATE_IGNORE);
    expect(await loadIgnore(config)).toEqual([]);
    expect(warn.mock.calls).toEqual([[SKIPPED_WARNING]]);
  });

  it('does not warn when packs and extends have no patterns', async () => {
    const config: ValidatedConfig = { ...withLayers(), extends: [] };
    rmSync(join(project, '.agentsmesh', 'packs'), { recursive: true });
    expect(await loadIgnore(config)).toEqual([]);
    expect(warn.mock.calls).toEqual([]);
  });

  it('drops them without a warning when the ignore feature is off', async () => {
    const config: ValidatedConfig = { ...withLayers(), features: ['rules'] };
    expect(await loadIgnore(config)).toEqual([]);
    expect(warn.mock.calls).toEqual([]);
  });

  it('adds them to local patterns, without duplicates', async () => {
    const config = withLayers();
    ignoreAt(join(project, '.agentsmesh'), '# mine\nmine/\npack-dir/\n');
    expect(await loadIgnore(config)).toEqual(['ext-dir/', 'pack-dir/', 'mine/']);
    expect(warn.mock.calls).toEqual([]);
  });
});
