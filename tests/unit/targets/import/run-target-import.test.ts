/**
 * runTargetImport adds back canonical permissions, ignore patterns and MCP
 * servers an import replaced, for every importer and every plugin (#131).
 * The CLI flows are covered in tests/unit/cli/commands/import-keeps-settings.test.ts.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
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
const IGNORE = '.agentsmesh/ignore';
const MCP = '.agentsmesh/mcp.json';

const { root, write, read } = useTempProject('am-run-import-');

const perms = (): unknown => parseYaml(read(PERMS));

/** A cursor-shaped descriptor whose import runs `body` instead. */
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

describe('runTargetImport', () => {
  it('a registered plugin descriptor gets the same merge through importFrom', async () => {
    write(PERMS, 'allow:\n  - Read\ndeny:\n  - Secret\n');
    write(IGNORE, 'keep/\n');
    write(MCP, JSON.stringify({ mcpServers: { kept: { command: 'k' } } }));
    const plugin = fakeDescriptor(() => {
      write(PERMS, 'allow:\n  - PluginAllow\ndeny: []\n');
      write(IGNORE, 'plugin/\n');
      write(MCP, JSON.stringify({ mcpServers: { pluginsrv: { command: 'p' } } }));
    });
    registerTargetDescriptor({ ...getDescriptor('cursor')!, ...plugin, id: 'merge-plugin' });

    await importFrom('merge-plugin', { root: root() });

    expect(perms()).toEqual({ allow: ['Read', 'PluginAllow'], deny: ['Secret'] });
    expect(read(IGNORE)).toBe('keep/\nplugin/\n');
    expect(JSON.parse(read(MCP))).toEqual({
      mcpServers: { kept: { command: 'k' }, pluginsrv: { command: 'p' } },
    });
  });

  it('does not touch files the import did not write', async () => {
    const perm = '# mine\nallow:\n  - Read\n';
    write(PERMS, perm);
    write(IGNORE, '# note\n\nkeep/\n');

    await importWith(() => undefined);

    expect([read(PERMS), read(IGNORE)]).toEqual([perm, '# note\n\nkeep/\n']);
  });

  it('adds only ignore lines the earlier file lacks, after its own lines', async () => {
    write(IGNORE, 'a\n# note\nb\n');

    await importWith(() => write(IGNORE, 'b\n\nc\n'));

    expect(read(IGNORE)).toBe('a\n# note\nb\nc\n');
  });

  it('keeps the new permissions file comments and adds back only missing entries', async () => {
    write(PERMS, 'allow:\n  - Read\ndeny:\n  - Secret\n');

    await importWith(() => write(PERMS, '# from tool\nallow:\n  - Read\n  - Write\n'));

    expect(read(PERMS).startsWith('# from tool\n')).toBe(true);
    expect(perms()).toEqual({ allow: ['Read', 'Write'], deny: ['Secret'] });
  });

  it('restores the entries when the import deletes the files', async () => {
    write(PERMS, 'deny:\n  - Secret\n');
    write(IGNORE, 'keep/\n');

    await importWith(() => {
      rmSync(join(root(), PERMS));
      rmSync(join(root(), IGNORE));
    });

    expect([perms(), read(IGNORE)]).toEqual([{ deny: ['Secret'] }, 'keep/\n']);
  });

  it('keeps what the import wrote when the earlier files are broken', async () => {
    write(PERMS, 'allow: [unclosed\n');
    write(MCP, '{ not json');

    await importWith(() => {
      write(PERMS, 'allow:\n  - New\n');
      write(MCP, '{"mcpServers":{"n":{"command":"n"}}}');
    });

    expect([read(PERMS), read(MCP)]).toEqual([
      'allow:\n  - New\n',
      '{"mcpServers":{"n":{"command":"n"}}}',
    ]);
  });

  it('adds back an MCP server named like an Object method', async () => {
    write(MCP, JSON.stringify({ mcpServers: { constructor: { command: 'c' } } }));

    await importWith(() => write(MCP, JSON.stringify({ mcpServers: { n: { command: 'n' } } })));

    expect(Object.keys((JSON.parse(read(MCP)) as { mcpServers: object }).mcpServers)).toEqual([
      'constructor',
      'n',
    ]);
  });
});
