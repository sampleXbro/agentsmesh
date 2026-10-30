/**
 * An importer that writes a list the tool never had, as `[]`, must not make
 * permissions.yaml start managing it: generate would then clear that list in
 * every other tool. A list the file already managed, even `[]`, stays managed.
 */

import { parse as parseYaml } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { useTempProject } from '../../../helpers/temp-project.js';
import { importFrom } from '../../../../src/public/engine.js';
import { runTargetImport } from '../../../../src/targets/import/run-target-import.js';
import {
  getDescriptor,
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';
import type { ImportResult } from '../../../../src/core/types.js';

const PERMS = '.agentsmesh/permissions.yaml';

const { root, write, read } = useTempProject('am-run-import-empty-');

const perms = (): unknown => parseYaml(read(PERMS));

function fakeDescriptor(body: () => void): Pick<TargetDescriptor, 'generators'> {
  const importFrom = async (): Promise<ImportResult[]> => {
    body();
    return [];
  };
  return { generators: { ...getDescriptor('cursor')!.generators, importFrom } };
}

const importWith = (body: () => void): Promise<ImportResult[]> =>
  runTargetImport(fakeDescriptor(body), root(), 'project');

afterEach(() => {
  resetRegistry();
});

describe('runTargetImport and empty permission lists', () => {
  it('drops empty lists the file did not manage before', async () => {
    await importWith(() => write(PERMS, 'allow:\n  - Read\ndeny: []\nask: []\n'));

    expect(perms()).toEqual({ allow: ['Read'] });
  });

  it('keeps an empty list the file already managed', async () => {
    write(PERMS, 'allow:\n  - Read\ndeny: []\n');

    await importWith(() => write(PERMS, 'allow:\n  - Write\n'));

    expect(perms()).toEqual({ allow: ['Read', 'Write'], deny: [] });
  });

  it('adds back managed lists after dropping an invented one', async () => {
    write(PERMS, 'ask:\n  - Bash\n');

    await importWith(() => write(PERMS, 'deny: []\n'));

    expect(perms()).toEqual({ ask: ['Bash'] });
  });

  it('leaves a file that manages nothing when every written list was invented', async () => {
    await importWith(() => write(PERMS, 'allow: []\ndeny: []\n'));

    expect(perms()).toEqual({});
  });

  it('leaves a file whose top level is not a map as it is', async () => {
    write(PERMS, 'allow:\n  - Read\n');

    await importWith(() => write(PERMS, '- Read\n'));

    expect(read(PERMS)).toBe('- Read\n');
  });

  it('a registered plugin descriptor gets the same rule through importFrom', async () => {
    const plugin = fakeDescriptor(() => write(PERMS, 'allow:\n  - PluginAllow\ndeny: []\n'));
    registerTargetDescriptor({ ...getDescriptor('cursor')!, ...plugin, id: 'empty-list-plugin' });

    await importFrom('empty-list-plugin', { root: root() });

    expect(perms()).toEqual({ allow: ['PluginAllow'] });
  });
});
