/**
 * Plugins are first-class targets: a registered plugin descriptor gets the
 * per-list permissions contract exactly like a builtin. A list missing from
 * permissions.yaml is absent from `canonical.permissions`, never `[]`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { generate } from '../../../../src/core/generate/engine.js';
import {
  getDescriptor,
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';
import type { CanonicalFiles, Permissions } from '../../../../src/core/types.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import { parsePermissionsContent } from '../../../../src/canonical/features/permissions.js';

const TEST_DIR = join(tmpdir(), 'am-plugin-unmanaged-permission-lists');
const RICH_PLUGIN = pathToFileURL(
  join(process.cwd(), 'tests/fixtures/plugins/rich-plugin/index.js'),
).href;

function canonical(permissions: Permissions | null): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions,
    hooks: null,
    ignore: [],
  };
}

const CONFIG: ValidatedConfig = {
  version: 1,
  targets: [],
  plugins: [],
  pluginTargets: ['rich-plugin'],
  features: ['permissions'],
  extends: [],
  overrides: {},
  collaboration: { strategy: 'merge', lock_features: [] },
};

beforeEach(async () => {
  mkdirSync(TEST_DIR, { recursive: true });
  const mod = (await import(RICH_PLUGIN)) as { descriptor: TargetDescriptor };
  registerTargetDescriptor(mod.descriptor);
});

afterEach(() => {
  resetRegistry();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('registered plugin — unmanaged permission lists', () => {
  it('receives only the lists permissions.yaml manages', async () => {
    const permissions = parsePermissionsContent('allow:\n  - Read\n# deny:\n#   - Bash\n', 'p');

    const results = await generate({
      config: CONFIG,
      canonical: canonical(permissions),
      projectRoot: TEST_DIR,
    });

    expect(results.map((result) => result.path).sort()).toEqual([
      '.rich/permissions.json',
      '.rich/settings.json',
    ]);
    const output = results.find((result) => result.path === '.rich/permissions.json')!;
    expect(JSON.parse(output.content)).toEqual({ allow: ['Read'] });
  });

  it('runs its permissions lint hook when a list is missing', () => {
    const lint = getDescriptor('rich-plugin')!.lint!.permissions!;

    expect(lint(canonical({ deny: ['Write'] }))).toEqual([]);
    expect(lint(canonical({ allow: ['Write'], deny: ['Write'] }))).toEqual([
      {
        level: 'error',
        file: '',
        target: 'rich-plugin',
        message: "Permission 'Write' is both allowed and denied",
      },
    ]);
  });
});
