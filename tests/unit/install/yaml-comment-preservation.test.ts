/**
 * `agentsmesh.yaml` is hand-authored and committed. Adding or removing an
 * extends entry must not cost the user their comments or any key this version
 * does not model.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAgentsmeshWithNewExtend } from '../../../src/install/core/yaml-writer.js';
import { removeAgentsmeshExtendByName } from '../../../src/install/core/remove-extend-entry.js';
import { configSchema, type ValidatedConfig } from '../../../src/config/core/schema.js';

const ORIGINAL = `# Team config — keep this comment
version: 1
targets:
  - claude-code # only claude for now
features:
  - rules
notes: owned by platform team
extends:
  - name: shared
    source: ./shared
    features:
      - rules
`;

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'am-yaml-comments-'));
  configPath = join(dir, 'agentsmesh.yaml');
  await writeFile(configPath, ORIGINAL);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function config(names: readonly { name: string; source: string }[]): ValidatedConfig {
  return configSchema.parse({
    version: 1,
    targets: ['claude-code'],
    extends: names.map((e) => ({ ...e, features: ['rules'] })),
  });
}

describe('writeAgentsmeshWithNewExtend', () => {
  it('keeps comments and unmodelled keys when adding an entry', async () => {
    await writeAgentsmeshWithNewExtend(
      configPath,
      config([{ name: 'shared', source: './shared' }]),
      { name: 'added', source: './added' },
    );

    const out = await readFile(configPath, 'utf8');
    expect(out).toContain('# Team config — keep this comment');
    expect(out).toContain('# only claude for now');
    expect(out).toContain('notes: owned by platform team');
    expect(out).toContain('added');
  });
});

describe('removeAgentsmeshExtendByName', () => {
  it('keeps comments and unmodelled keys when removing an entry', async () => {
    const removed = await removeAgentsmeshExtendByName(
      configPath,
      config([{ name: 'shared', source: './shared' }]),
      'shared',
    );

    expect(removed).toBe(true);
    const out = await readFile(configPath, 'utf8');
    expect(out).toContain('# Team config — keep this comment');
    expect(out).toContain('# only claude for now');
    expect(out).toContain('notes: owned by platform team');
    expect(out).not.toContain('name: shared');
  });

  it('leaves the file byte-identical when nothing matches', async () => {
    const removed = await removeAgentsmeshExtendByName(
      configPath,
      config([{ name: 'shared', source: './shared' }]),
      'absent',
    );

    expect(removed).toBe(false);
    expect(await readFile(configPath, 'utf8')).toBe(ORIGINAL);
  });
});
