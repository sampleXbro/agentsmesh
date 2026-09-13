import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { writeAgentsmeshWithNewExtend } from '../../../src/install/core/yaml-writer.js';
import { configSchema, type ValidatedConfig } from '../../../src/config/core/schema.js';

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'am-extends-writer-'));
  configPath = join(dir, 'agentsmesh.yaml');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The config as the loader hands it over: project file MERGED with the local override. */
function mergedConfig(
  entries: readonly { name: string; source: string; features?: string[] }[],
): ValidatedConfig {
  return configSchema.parse({
    version: 1,
    targets: ['claude-code'],
    extends: entries.map((e) => ({ features: ['rules'], ...e })),
  });
}

describe('writeAgentsmeshWithNewExtend', () => {
  it('does not copy a local-only extend into the shared config file', async () => {
    await writeFile(
      configPath,
      'version: 1\ntargets:\n  - claude-code\nextends:\n  - name: shared\n    source: ./shared\n',
    );

    await writeAgentsmeshWithNewExtend(
      configPath,
      mergedConfig([
        { name: 'shared', source: './shared' },
        { name: 'private-local', source: './private' },
      ]),
      { name: 'added', source: './added' },
    );

    const names = (
      parseYaml(await readFile(configPath, 'utf8')) as { extends: { name: string }[] }
    ).extends.map((e) => e.name);
    expect(names).toEqual(['shared', 'added']);
  });

  it('still merges into the entries the shared file already declares', async () => {
    await writeFile(
      configPath,
      'version: 1\ntargets:\n  - claude-code\nextends:\n  - name: shared\n    source: ./shared\n',
    );

    await writeAgentsmeshWithNewExtend(
      configPath,
      mergedConfig([{ name: 'shared', source: './shared' }]),
      { name: 'shared', source: './shared', features: ['rules'] },
    );

    const entries = (
      parseYaml(await readFile(configPath, 'utf8')) as {
        extends: { name: string; features?: string[] }[];
      }
    ).extends;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.features).toEqual(['rules']);
  });

  it('writes the first extend into a file that declares none', async () => {
    await writeFile(configPath, 'version: 1\ntargets:\n  - claude-code\n');

    await writeAgentsmeshWithNewExtend(configPath, mergedConfig([]), {
      name: 'added',
      source: './added',
    });

    const names = (
      parseYaml(await readFile(configPath, 'utf8')) as { extends: { name: string }[] }
    ).extends.map((e) => e.name);
    expect(names).toEqual(['added']);
  });
});
