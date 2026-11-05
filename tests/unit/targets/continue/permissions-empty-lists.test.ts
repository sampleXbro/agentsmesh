/**
 * A list present in permissions.yaml, even `[]`, is managed: it is written to
 * `~/.continue/permissions.yaml` (deny as `exclude`) and the owned-keys merge
 * replaces the user's key. A missing list is left out, so the user's key stays.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CanonicalFiles, Permissions } from '../../../../src/core/types.js';
import { serializeContinuePermissions } from '../../../../src/targets/continue/permissions.js';
import { mergeContinueGlobalYaml } from '../../../../src/targets/continue/config-merge.js';
import { generateContinueScopeExtras } from '../../../../src/targets/continue/scope-extras.js';
import { CONTINUE_GLOBAL_PERMISSIONS } from '../../../../src/targets/continue/constants.js';

const HEADER = ['# Continue CLI Permissions Configuration', ''];

const ON_DISK = [
  ...HEADER,
  'allow:',
  '  - Read',
  'ask:',
  '  - Write',
  'exclude:',
  '  - Bash(rm*)',
  '',
].join('\n');

const ALL_EMPTY: Permissions = { allow: [], deny: [], ask: [] };

function mergeOnDisk(generated: string): string | null {
  return mergeContinueGlobalYaml(ON_DISK, undefined, generated, CONTINUE_GLOBAL_PERMISSIONS);
}

describe('serializeContinuePermissions — managed lists', () => {
  it('writes a managed empty list as []', () => {
    expect(serializeContinuePermissions({ allow: ['Read'], deny: [] }, null)).toBe(
      'allow:\n  - Read\nexclude: []\n',
    );
  });

  it('leaves out the lists permissions.yaml does not manage', () => {
    expect(serializeContinuePermissions({ deny: ['Write'] }, null)).toBe('exclude:\n  - Write\n');
  });

  it('writes nothing when no list is managed', () => {
    expect(serializeContinuePermissions(null, ON_DISK)).toBeNull();
    expect(serializeContinuePermissions({}, ON_DISK)).toBeNull();
  });

  it('writes every empty list when the file exists', () => {
    expect(serializeContinuePermissions(ALL_EMPTY, ON_DISK)).toBe(
      'allow: []\nask: []\nexclude: []\n',
    );
  });

  it('writes no file when every list is empty and there is none', () => {
    expect(serializeContinuePermissions(ALL_EMPTY, null)).toBeNull();
  });
});

describe('mergeContinueGlobalYaml — managed lists on disk', () => {
  it('clears every list when all three are empty and keeps the header', () => {
    const generated = serializeContinuePermissions(ALL_EMPTY, ON_DISK)!;
    expect(mergeOnDisk(generated)).toBe(
      [...HEADER, 'allow: []', 'ask: []', 'exclude: []', ''].join('\n'),
    );
  });

  it('clears only the managed empty list', () => {
    const generated = serializeContinuePermissions({ deny: [] }, ON_DISK)!;
    expect(mergeOnDisk(generated)).toBe(
      [...HEADER, 'allow:', '  - Read', 'ask:', '  - Write', 'exclude: []', ''].join('\n'),
    );
  });

  it('replaces a managed list and keeps the unmanaged ones', () => {
    const generated = serializeContinuePermissions({ allow: ['Search'] }, ON_DISK)!;
    expect(mergeOnDisk(generated)).toBe(
      [
        ...HEADER,
        'allow:',
        '  - Search',
        'ask:',
        '  - Write',
        'exclude:',
        '  - Bash(rm*)',
        '',
      ].join('\n'),
    );
  });
});

describe('generateContinueScopeExtras — managed empty lists', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'continue-perms-empty-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function canonical(permissions: Permissions): CanonicalFiles {
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

  async function permissionResults(): Promise<{ path: string; content: string }[]> {
    const results = await generateContinueScopeExtras(
      canonical(ALL_EMPTY),
      dir,
      'global',
      new Set(['permissions']),
    );
    return results.map(({ path, content }) => ({ path, content }));
  }

  it('emits the empty lists when the user has a permissions file', async () => {
    mkdirSync(join(dir, '.continue'), { recursive: true });
    writeFileSync(join(dir, CONTINUE_GLOBAL_PERMISSIONS), ON_DISK);
    expect(await permissionResults()).toEqual([
      { path: CONTINUE_GLOBAL_PERMISSIONS, content: 'allow: []\nask: []\nexclude: []\n' },
    ]);
  });

  it('emits nothing when every list is empty and the user has no file', async () => {
    expect(await permissionResults()).toEqual([]);
  });
});
