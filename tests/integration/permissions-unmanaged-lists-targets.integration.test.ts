/**
 * A list missing from permissions.yaml stays the user's in every projection
 * shape: a key-scoped JSON container (cursor), a YAML category (goose), one
 * decision-tagged rule list (kimi-code) and an allow-only projection (pi-agent).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { parse as parseToml } from 'smol-toml';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { CURSOR_CLI_JSON } from '../../src/targets/cursor/constants.js';
import { GOOSE_GLOBAL_PERMISSIONS } from '../../src/targets/goose/constants.js';
import { KIMI_CODE_GLOBAL_CONFIG_FILE } from '../../src/targets/kimi-code/constants.js';
import { PI_AGENT_SETTINGS_FILE } from '../../src/targets/pi-agent/constants.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-perm-unmanaged-targets-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

interface Case {
  readonly target: string;
  readonly scope: 'project' | 'global';
  readonly path: string;
  readonly user: string;
  readonly permissionsYaml: string;
  readonly parse: (content: string) => unknown;
  /** Parsed file after generate; `null` means byte-for-byte unchanged. */
  readonly expected: unknown;
}

const CASES: readonly Case[] = [
  {
    target: 'cursor',
    scope: 'project',
    path: CURSOR_CLI_JSON,
    user: JSON.stringify({
      version: 1,
      permissions: { allow: ['Shell(ls)'], deny: ['Shell(rm)'] },
    }),
    permissionsYaml: 'allow:\n  - Read\n',
    parse: JSON.parse,
    expected: { version: 1, permissions: { allow: ['Read'], deny: ['Shell(rm)'] } },
  },
  {
    target: 'goose',
    scope: 'global',
    path: GOOSE_GLOBAL_PERMISSIONS,
    user: [
      'smart_approve:',
      '  always_allow:',
      '    - cached__tool',
      'user:',
      '  always_allow:',
      '    - old__tool',
      '  never_allow:',
      '    - developer__rm',
      '',
    ].join('\n'),
    permissionsYaml: 'allow:\n  - developer__shell\n',
    parse: parseYaml,
    expected: {
      smart_approve: { always_allow: ['cached__tool'] },
      user: { always_allow: ['developer__shell'], ask_before: [], never_allow: ['developer__rm'] },
    },
  },
  {
    target: 'kimi-code',
    scope: 'global',
    path: KIMI_CODE_GLOBAL_CONFIG_FILE,
    user: [
      '[providers.kimi]',
      'api_key = "sk-keep"',
      '',
      '[[permission.rules]]',
      'decision = "deny"',
      'pattern = "Bash(rm *)"',
      '',
    ].join('\n'),
    permissionsYaml: 'allow:\n  - Read\n',
    parse: parseToml,
    expected: {
      providers: { kimi: { api_key: 'sk-keep' } },
      permission: {
        rules: [
          { decision: 'allow', pattern: 'Read' },
          { decision: 'deny', pattern: 'Bash(rm *)' },
        ],
      },
    },
  },
  {
    target: 'pi-agent',
    scope: 'project',
    path: PI_AGENT_SETTINGS_FILE,
    user: JSON.stringify({ theme: 'dark', defaultTools: ['read', 'grep'] }),
    permissionsYaml: 'deny:\n  - Bash(rm:*)\n',
    parse: JSON.parse,
    expected: null,
  },
];

async function seed(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

describe.each(CASES)('unmanaged permission lists: $target ($scope)', (c) => {
  it('keeps the user entries of every list permissions.yaml does not manage', async () => {
    const canonicalDir = join(root, '.agentsmesh');
    if (c.scope === 'global') {
      vi.stubEnv('HOME', root);
      vi.stubEnv('USERPROFILE', root);
    }
    const configDir = c.scope === 'global' ? canonicalDir : root;
    await seed(
      join(configDir === root ? '' : '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1\ntargets: [${c.target}]\nfeatures: [permissions]\n`,
    );
    await seed('.agentsmesh/permissions.yaml', c.permissionsYaml);
    await seed(c.path, c.user);

    const generated = await runGenerate(c.scope === 'global' ? { global: true } : {}, root, {
      printMatrix: false,
    });

    const after = await readFile(join(root, c.path), 'utf8');
    if (c.expected === null) {
      expect(generated.data.files).toEqual([]);
      expect(after).toBe(c.user);
      return;
    }
    expect(generated.data.files.map((file) => file.path)).toEqual([c.path]);
    expect(c.parse(after)).toEqual(c.expected);
  });
});
