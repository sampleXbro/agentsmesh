/**
 * `install <source> --name x` must not adopt an `extends` entry the user wrote
 * by hand: `uninstall x` removes the row by name, so adopting it means their
 * entry disappears with the pack.
 */

import { describe, expect, it } from 'vitest';
import { selectInstallEntryName } from '../../../src/install/core/install-name.js';
import { configSchema, type ValidatedConfig } from '../../../src/config/core/schema.js';

function config(entries: readonly { name: string; source: string }[]): ValidatedConfig {
  return configSchema.parse({
    version: 1,
    targets: ['claude-code'],
    extends: entries.map((e) => ({ ...e, features: ['rules'] })),
  });
}

const parsed = { kind: 'local' as const, path: '../src-pack' };
const args = {
  parsed: parsed as unknown as Parameters<typeof selectInstallEntryName>[0]['parsed'],
  entryFeatures: ['rules'] as ValidatedConfig['features'],
};

describe('selectInstallEntryName', () => {
  it('refuses an explicit name already used by another extends entry', () => {
    expect(() =>
      selectInstallEntryName({
        ...args,
        config: config([{ name: 'shared', source: './shared' }]),
        nameOverride: 'shared',
      }),
    ).toThrow(/already used by an extends entry pointing at "\.\/shared"/);
  });

  it('allows reusing the name an earlier install of the same source holds', () => {
    expect(
      selectInstallEntryName({
        ...args,
        config: config([{ name: 'shared', source: '../src-pack' }]),
        nameOverride: '',
        reuseExistingName: 'shared',
      }),
    ).toBe('shared');
  });

  it('accepts an explicit name nothing else claims', () => {
    expect(
      selectInstallEntryName({
        ...args,
        config: config([{ name: 'other', source: './other' }]),
        nameOverride: 'mine',
      }),
    ).toBe('mine');
  });
});
