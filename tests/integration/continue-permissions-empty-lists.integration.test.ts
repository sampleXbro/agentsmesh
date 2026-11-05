/**
 * A list present in permissions.yaml, even `[]`, is managed: `generate --global`
 * clears the matching list in `~/.continue/permissions.yaml` (deny as
 * `exclude`), while unmanaged lists and the file's header stay as they are.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { runCheck } from '../../src/cli/commands/check.js';
import { CONTINUE_GLOBAL_PERMISSIONS } from '../../src/targets/continue/constants.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-continue-perm-empty-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const HEADER = [
  '# Continue CLI Permissions Configuration',
  '# This file is managed by the Continue CLI and should not be edited manually.',
  '',
];

const ON_DISK = [
  ...HEADER,
  'allow:',
  '  - Read',
  '  - Bash(ls*)',
  'ask:',
  '  - Write',
  'exclude:',
  '  - Bash(rm*)',
  '',
].join('\n');

async function seed(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

async function generateWith(permissionsYaml: string): Promise<string> {
  await seed(
    '.agentsmesh/agentsmesh.yaml',
    'version: 1\ntargets: [continue]\nfeatures: [permissions]\n',
  );
  await seed('.agentsmesh/permissions.yaml', permissionsYaml);
  await seed(CONTINUE_GLOBAL_PERMISSIONS, ON_DISK);

  const generated = await runGenerate({ global: true }, root, { printMatrix: false });

  expect(generated.data.files.map((file) => file.path)).toEqual([CONTINUE_GLOBAL_PERMISSIONS]);
  expect((await runCheck({ global: true }, root)).exitCode).toBe(0);
  return readFile(join(root, CONTINUE_GLOBAL_PERMISSIONS), 'utf8');
}

describe('continue managed empty permission lists (global)', () => {
  it('clears every list when all three lists are empty', async () => {
    expect(await generateWith('allow: []\ndeny: []\nask: []\n')).toBe(
      [...HEADER, 'allow: []', 'ask: []', 'exclude: []', ''].join('\n'),
    );
  });

  it('clears only the managed empty list', async () => {
    expect(await generateWith('deny: []\n')).toBe(
      [
        ...HEADER,
        'allow:',
        '  - Read',
        '  - Bash(ls*)',
        'ask:',
        '  - Write',
        'exclude: []',
        '',
      ].join('\n'),
    );
  });

  it('keeps the lists permissions.yaml does not manage', async () => {
    expect(await generateWith('allow:\n  - Search\n')).toBe(
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
