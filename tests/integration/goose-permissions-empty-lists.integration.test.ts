/**
 * A list present in permissions.yaml, even `[]`, is managed: `generate --global`
 * clears the matching Goose list in `~/.config/goose/permission.yaml`, while
 * unmanaged lists and the runtime `smart_approve` cache stay as they are.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { runCheck } from '../../src/cli/commands/check.js';
import { GOOSE_GLOBAL_PERMISSIONS } from '../../src/targets/goose/constants.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-goose-perm-empty-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const SMART_APPROVE = [
  '# my goose permissions',
  'smart_approve:',
  '  always_allow:',
  '    - cached__tool',
  '  ask_before: []',
  '  never_allow: []',
];

const ON_DISK = [
  ...SMART_APPROVE,
  'user:',
  '  always_allow:',
  '    - developer__shell',
  '  ask_before:',
  '    - memory__remember',
  '  never_allow:',
  '    - developer__rm',
  '',
].join('\n');

async function seed(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

async function generateWith(permissionsYaml: string): Promise<string> {
  await seed(
    '.agentsmesh/agentsmesh.yaml',
    'version: 1\ntargets: [goose]\nfeatures: [permissions]\n',
  );
  await seed('.agentsmesh/permissions.yaml', permissionsYaml);
  await seed(GOOSE_GLOBAL_PERMISSIONS, ON_DISK);

  const generated = await runGenerate({ global: true }, root, { printMatrix: false });

  expect(generated.data.files.map((file) => file.path)).toEqual([GOOSE_GLOBAL_PERMISSIONS]);
  expect((await runCheck({ global: true }, root)).exitCode).toBe(0);
  return readFile(join(root, GOOSE_GLOBAL_PERMISSIONS), 'utf8');
}

describe('goose managed empty permission lists (global)', () => {
  it('clears every user list when all three lists are empty', async () => {
    expect(await generateWith('allow: []\ndeny: []\nask: []\n')).toBe(
      [
        ...SMART_APPROVE,
        'user:',
        '  always_allow: []',
        '  ask_before: []',
        '  never_allow: []',
        '',
      ].join('\n'),
    );
  });

  it('clears only the managed empty list', async () => {
    expect(await generateWith('deny: []\n')).toBe(
      [
        ...SMART_APPROVE,
        'user:',
        '  always_allow:',
        '    - developer__shell',
        '  ask_before:',
        '    - memory__remember',
        '  never_allow: []',
        '',
      ].join('\n'),
    );
  });
});
