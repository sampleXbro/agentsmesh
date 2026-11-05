/**
 * Zed import writes only the permission lists Zed sets: a list it does not set
 * is not invented as `[]`, and the canonical file's own lists stay as they are.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ImportResult } from '../../../../src/core/types.js';
import { importZedSettingsFeatures } from '../../../../src/targets/zed/settings-import.js';
import { ZED_GLOBAL_SETTINGS_FILE } from '../../../../src/targets/zed/constants.js';

const PERMS = '.agentsmesh/permissions.yaml';
let root = '';

function write(relPath: string, content: string): void {
  mkdirSync(dirname(join(root, relPath)), { recursive: true });
  writeFileSync(join(root, relPath), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-zed-import-lists-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('importZedSettingsFeatures — permission lists', () => {
  it('writes only the lists Zed sets and leaves the other canonical lists alone', async () => {
    write(
      ZED_GLOBAL_SETTINGS_FILE,
      JSON.stringify({
        agent: {
          tool_permissions: { tools: { terminal: { always_allow: [{ pattern: '^ls$' }] } } },
        },
      }),
    );
    write(PERMS, 'deny:\n  - Edit(./.env)\n');

    const results: ImportResult[] = [];
    await importZedSettingsFeatures(root, ZED_GLOBAL_SETTINGS_FILE, 'global', results);

    expect(parseYaml(readFileSync(join(root, PERMS), 'utf8'))).toEqual({
      deny: ['Edit(./.env)'],
      allow: ['Bash(ls)'],
    });
    expect(results.map((r) => r.feature)).toEqual(['permissions']);
  });

  it('writes no permissions when the settings have none', async () => {
    write(ZED_GLOBAL_SETTINGS_FILE, JSON.stringify({ theme: 'One Dark' }));

    const results: ImportResult[] = [];
    await importZedSettingsFeatures(root, ZED_GLOBAL_SETTINGS_FILE, 'global', results);

    expect(existsSync(join(root, PERMS))).toBe(false);
    expect(results).toEqual([]);
  });
});
