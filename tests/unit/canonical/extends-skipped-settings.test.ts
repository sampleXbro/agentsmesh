/**
 * loadCanonicalWithExtends returns the settings it skipped from packs and
 * extends, so `--json` and MCP callers learn what the muted warning says.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { loadCanonicalWithExtends } from '../../../src/canonical/extends/extends.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import { logger } from '../../../src/utils/output/logger.js';

const ALL_SKIPPED = [
  { feature: 'mcp', items: ['ext-srv'] },
  { feature: 'permissions', items: ['allow Read'] },
  { feature: 'hooks', items: ['PreToolUse (1 hook)'] },
  { feature: 'ignore', items: ['.env'] },
];

let base: string;
let project: string;
let warn: MockInstance<typeof logger.warn>;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'amesh-skipped-settings-'));
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh'), { recursive: true });
  const shared = join(base, 'shared', '.agentsmesh');
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, 'mcp.json'), '{"mcpServers":{"ext-srv":{"command":"e"}}}');
  writeFileSync(join(shared, 'permissions.yaml'), 'allow:\n  - Read\n');
  writeFileSync(join(shared, 'hooks.yaml'), 'PreToolUse:\n  - matcher: Bash\n    command: echo\n');
  writeFileSync(join(shared, 'ignore'), '.env\n');
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  rmSync(base, { recursive: true, force: true });
});

function config(features: ValidatedConfig['features']): ValidatedConfig {
  return {
    version: 1,
    targets: ['claude-code'],
    features,
    extends: [
      {
        name: 'base',
        source: join('..', 'shared'),
        features: ['mcp', 'permissions', 'hooks', 'ignore'],
      },
    ],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    plugins: [],
    pluginTargets: [],
  };
}

describe('loadCanonicalWithExtends — skippedSettings', () => {
  it('returns every skipped feature with its items', async () => {
    const { skippedSettings } = await loadCanonicalWithExtends(
      config(['mcp', 'permissions', 'hooks', 'ignore']),
      project,
    );

    expect(skippedSettings).toEqual(ALL_SKIPPED);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('leaves out features the config does not enable', async () => {
    const { skippedSettings } = await loadCanonicalWithExtends(config(['mcp']), project);

    expect(skippedSettings).toEqual([{ feature: 'mcp', items: ['ext-srv'] }]);
  });

  it('still returns them when the warning is turned off', async () => {
    const { skippedSettings } = await loadCanonicalWithExtends(
      config(['mcp', 'permissions', 'hooks', 'ignore']),
      project,
      { warnSkippedSettings: false },
    );

    expect(skippedSettings).toEqual(ALL_SKIPPED);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is empty when the local files manage every setting', async () => {
    const local = join(project, '.agentsmesh');
    writeFileSync(join(local, 'mcp.json'), '{"mcpServers":{}}');
    writeFileSync(join(local, 'permissions.yaml'), 'allow: []\n');
    writeFileSync(join(local, 'hooks.yaml'), '{}\n');
    writeFileSync(join(local, 'ignore'), 'dist\n');

    const { skippedSettings } = await loadCanonicalWithExtends(
      config(['mcp', 'permissions', 'hooks', 'ignore']),
      project,
    );

    expect(skippedSettings).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
