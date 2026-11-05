/**
 * Packs and extends add permissions and hooks only to what the user manages in
 * their own permissions.yaml and hooks.yaml. A missing or comment-only file
 * leaves the feature unmanaged, so their values are dropped and generate leaves
 * the permissions and hooks already in the tools alone.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { loadCanonicalWithExtends } from '../../../src/canonical/extends/extends.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../src/core/types.js';
import { logger } from '../../../src/utils/output/logger.js';
import { TEMPLATE_HOOKS, TEMPLATE_PERMISSIONS } from '../../../src/cli/commands/init-templates.js';

const permissionsWarning = (items: string): string =>
  `[agentsmesh] Skipped permissions from installed packs or extends: ${items}. ` +
  `Your own permissions.yaml does not manage these lists (missing or commented out), so AgentsMesh does not write them to your tools: your tools keep their own lists, ` +
  `and a file AgentsMesh wrote only from them is removed. ` +
  `To use them, add the list to permissions.yaml (an empty list is fine), or run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh) ` +
  `to copy in the lists your tools already have, then generate again.`;
const PERMISSIONS_WARNING = permissionsWarning('allow Grep, allow Read, deny WebFetch, ask Write');
const HOOKS_WARNING =
  '[agentsmesh] Skipped hooks from installed packs or extends: PreToolUse (2 hooks), PostToolUse (1 hook). ' +
  'Your own hooks.yaml is missing or has only comments, so AgentsMesh does not write them to your tools: your tools keep their own hooks, ' +
  'and a file AgentsMesh wrote only from them is removed. ' +
  'To use them, write your hooks in hooks.yaml ("{}" if you have none), or run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh) ' +
  'to copy in the hooks your tools already have, then generate again.';

let base: string;
let project: string;
let warn: MockInstance<typeof logger.warn>;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'amesh-unmanaged-perms-hooks-'));
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh'), { recursive: true });
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  rmSync(base, { recursive: true, force: true });
});

const hook = (command: string): string => `  - matcher: Bash\n    command: ${command}\n`;
const local = (file: string, content: string): void =>
  writeFileSync(join(project, '.agentsmesh', file), content);

function settingsAt(dir: string, permissions: string, hooks: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'permissions.yaml'), permissions);
  writeFileSync(join(dir, 'hooks.yaml'), hooks);
}

function packAt(name: string, permissions: string, hooks: string): void {
  const dir = join(project, '.agentsmesh', 'packs', name);
  settingsAt(dir, permissions, hooks);
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
      '  - permissions',
      '  - hooks',
    ].join('\n'),
  );
}

function withLayers(
  features: ValidatedConfig['features'] = ['permissions', 'hooks'],
): ValidatedConfig {
  settingsAt(
    join(base, 'shared', '.agentsmesh'),
    'allow:\n  - Grep\n',
    `PreToolUse:\n${hook('ext-hook')}`,
  );
  packAt(
    'guard',
    'allow:\n  - Read\ndeny:\n  - WebFetch\nask:\n  - Write\n',
    `PreToolUse:\n${hook('pack-guard')}PostToolUse:\n${hook('pack-post')}`,
  );
  return {
    version: 1,
    targets: ['claude-code'],
    features,
    extends: [{ name: 'base', source: join('..', 'shared'), features: ['permissions', 'hooks'] }],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    plugins: [],
    pluginTargets: [],
  };
}

async function load(config: ValidatedConfig): Promise<CanonicalFiles> {
  return (await loadCanonicalWithExtends(config, project)).canonical;
}

const commands = (canonical: CanonicalFiles, event: 'PreToolUse' | 'PostToolUse'): string[] =>
  (canonical.hooks?.[event] ?? []).map((h) => h.command);

describe('permissions and hooks from packs and extends need a managed local file', () => {
  it('drops both and warns once per feature when the local files are missing', async () => {
    const canonical = await load(withLayers());
    expect(canonical.permissions).toBeNull();
    expect(canonical.hooks).toBeNull();
    expect(warn.mock.calls).toEqual([[PERMISSIONS_WARNING], [HOOKS_WARNING]]);
  });

  it('drops both when the local files are the commented-out init templates', async () => {
    const config = withLayers();
    local('permissions.yaml', TEMPLATE_PERMISSIONS);
    local('hooks.yaml', TEMPLATE_HOOKS);
    const canonical = await load(config);
    expect(canonical.permissions).toBeNull();
    expect(canonical.hooks).toBeNull();
    expect(warn.mock.calls).toEqual([[PERMISSIONS_WARNING], [HOOKS_WARNING]]);
  });

  it('drops empty pack values without a warning', async () => {
    const config: ValidatedConfig = { ...withLayers(), extends: [] };
    rmSync(join(project, '.agentsmesh', 'packs', 'guard'), { recursive: true });
    packAt('empty-pack', 'allow: []\n', '{}\n');
    const canonical = await load(config);
    expect(canonical.permissions).toBeNull();
    expect(canonical.hooks).toBeNull();
    expect(warn.mock.calls).toEqual([]);
  });

  it('drops both without a warning when the features are off', async () => {
    const canonical = await load(withLayers(['rules']));
    expect(canonical.permissions).toBeNull();
    expect(canonical.hooks).toBeNull();
    expect(warn.mock.calls).toEqual([]);
  });

  it('warns only for the unmanaged feature', async () => {
    const config = withLayers();
    local('hooks.yaml', '{}\n');
    const canonical = await load(config);
    expect(canonical.permissions).toBeNull();
    expect(commands(canonical, 'PreToolUse')).toEqual(['ext-hook', 'pack-guard']);
    expect(warn.mock.calls).toEqual([[PERMISSIONS_WARNING]]);
  });

  it('adds them to empty managed files', async () => {
    const config = withLayers();
    local('permissions.yaml', 'allow: []\ndeny: []\nask: []\n');
    local('hooks.yaml', '{}\n');
    const canonical = await load(config);
    expect(canonical.permissions).toEqual({
      allow: ['Grep', 'Read'],
      deny: ['WebFetch'],
      ask: ['Write'],
    });
    expect(commands(canonical, 'PreToolUse')).toEqual(['ext-hook', 'pack-guard']);
    expect(commands(canonical, 'PostToolUse')).toEqual(['pack-post']);
    expect(warn.mock.calls).toEqual([]);
  });

  it('adds them to local values; a local event overrides the extend, the pack hook stays', async () => {
    const config = withLayers();
    local('permissions.yaml', 'allow:\n  - Bash(ls)\ndeny:\n  - Bash(rm)\n');
    local('hooks.yaml', `PreToolUse:\n${hook('local-recall')}`);
    const canonical = await load(config);
    expect(canonical.permissions).toEqual({
      allow: ['Grep', 'Read', 'Bash(ls)'],
      deny: ['WebFetch', 'Bash(rm)'],
    });
    expect(commands(canonical, 'PreToolUse')).toEqual(['local-recall', 'pack-guard']);
    expect(commands(canonical, 'PostToolUse')).toEqual(['pack-post']);
    expect(warn.mock.calls).toEqual([[permissionsWarning('ask Write')]]);
  });

  it('adds permissions only to the lists the local file manages', async () => {
    const config = withLayers(['permissions']);
    local('permissions.yaml', 'allow: []\n');
    const canonical = await load(config);
    expect(canonical.permissions).toEqual({ allow: ['Grep', 'Read'] });
    expect(warn.mock.calls).toEqual([[permissionsWarning('deny WebFetch, ask Write')]]);
  });
});
