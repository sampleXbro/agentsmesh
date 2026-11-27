/**
 * Outputs of a target the config no longer lists. The stale sweep only walks
 * configured targets, so these are found from the previous lock instead, and
 * deleted only when the file still holds exactly what agentsmesh wrote.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  deleteRemovedOutputs,
  planRemovedOutputs,
} from '../../../../src/core/generate/removed-outputs.js';
import { buildOutputChecksums } from '../../../../src/config/core/lock-outputs.js';
import { writeFileAtomic } from '../../../../src/utils/filesystem/fs.js';
import {
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';

const RICH_PLUGIN = pathToFileURL(
  join(process.cwd(), 'tests/fixtures/plugins/rich-plugin/index.js'),
).href;

let root = '';
let outside = '';

function checksum(path: string, content: string): string {
  return buildOutputChecksums([{ target: 't', path, content, status: 'created' }])[path] ?? '';
}

/** Writes the file the way generate does and returns its lock entry. */
async function generated(rel: string, content = 'generated\n'): Promise<Record<string, string>> {
  await writeFileAtomic(join(root, rel), content);
  return { [rel]: checksum(rel, content) };
}

function plan(
  previousOutputs: Record<string, string>,
  extra: { expectedPaths?: string[]; configuredTargets?: string[] } = {},
): ReturnType<typeof planRemovedOutputs> {
  return planRemovedOutputs({
    projectRoot: root,
    scope: 'project',
    previousOutputs,
    expectedPaths: extra.expectedPaths ?? [],
    configuredTargets: extra.configuredTargets ?? ['claude-code'],
  });
}

beforeEach(() => {
  outside = mkdtempSync(join(tmpdir(), 'am-removed-'));
  root = join(outside, 'project');
  mkdirSync(root);
});

afterEach(() => rmSync(outside, { recursive: true, force: true }));

describe('planRemovedOutputs', () => {
  it('lists unmodified outputs of a target that is no longer configured', async () => {
    const lock = {
      ...(await generated('.cursor/rules/general.mdc')),
      ...(await generated('.cursor/skills/lessons/SKILL.md')),
    };

    expect(await plan(lock)).toEqual({
      stale: ['.cursor/rules/general.mdc', '.cursor/skills/lessons/SKILL.md'],
      kept: [],
    });
  });

  it('keeps a file that was edited by hand and says why', async () => {
    const lock = {
      ...(await generated('.cursor/rules/general.mdc')),
      ...(await generated('.cursor/rules/mine.mdc')),
    };
    await writeFileAtomic(join(root, '.cursor/rules/mine.mdc'), 'my own rule\n');

    expect(await plan(lock)).toEqual({
      stale: ['.cursor/rules/general.mdc'],
      kept: [{ path: '.cursor/rules/mine.mdc', reason: 'edited' }],
    });
  });

  it('ignores a locked file that is already gone', async () => {
    const lock = { '.cursor/rules/gone.mdc': checksum('.cursor/rules/gone.mdc', 'x') };

    expect(await plan(lock)).toEqual({ stale: [], kept: [] });
  });

  it('does not touch a path this run still produces', async () => {
    const lock = await generated('AGENTS.md');

    expect(await plan(lock, { expectedPaths: ['AGENTS.md'] })).toEqual({ stale: [], kept: [] });
  });

  it('leaves outputs under a configured target to the stale sweep', async () => {
    const lock = {
      ...(await generated('.claude/rules/old.md')),
      ...(await generated('CLAUDE.md')),
    };

    expect(await plan(lock)).toEqual({ stale: [], kept: [] });
  });

  it('keeps the shared config of a removed target and says it is shared', async () => {
    const lock = {
      ...(await generated('.cursor/mcp.json', '{}\n')),
      ...(await generated('.cursor/hooks.json', '{}\n')),
    };

    expect(await plan(lock)).toEqual({
      stale: [],
      kept: [
        { path: '.cursor/hooks.json', reason: 'shared' },
        { path: '.cursor/mcp.json', reason: 'shared' },
      ],
    });
  });

  it('stays silent about the shared config of a target that is still configured', async () => {
    const lock = await generated('.cursor/mcp.json', '{}\n');

    expect(await plan(lock, { configuredTargets: ['cursor'] })).toEqual({ stale: [], kept: [] });
  });

  it('finds outputs of a target nothing knows about any more', async () => {
    const lock = await generated('.gone-plugin/rules/a.md');

    expect(await plan(lock)).toEqual({ stale: ['.gone-plugin/rules/a.md'], kept: [] });
  });

  it('compares the checksum the way generate wrote it, for CRLF content', async () => {
    const lock = await generated('.cursor/rules/crlf.mdc', 'one\r\ntwo\r\n');

    expect(await plan(lock)).toEqual({ stale: ['.cursor/rules/crlf.mdc'], kept: [] });
  });

  it('never lists canonical sources, config files or paths outside the root', async () => {
    const lock = {
      ...(await generated('.agentsmesh/rules/a.md')),
      ...(await generated('packages/app/.agentsmesh/rules/a.md')),
      ...(await generated('agentsmesh.yaml')),
      ...(await generated('agentsmesh.local.yaml')),
      ...(await generated('.cursor/../.agentsmesh/rules/b.md')),
      '../outside.txt': checksum('../outside.txt', 'secret\n'),
    };
    await writeFileAtomic(join(outside, 'outside.txt'), 'secret\n');

    expect(await plan(lock)).toEqual({ stale: [], kept: [] });
    expect(existsSync(join(outside, 'outside.txt'))).toBe(true);
  });

  it('ignores a path that reaches outside the root through a symlinked directory', async () => {
    await writeFileAtomic(join(outside, 'elsewhere/rules/a.md'), 'x\n');
    symlinkSync(join(outside, 'elsewhere'), join(root, '.cursor'), 'dir');

    expect(await plan({ '.cursor/rules/a.md': checksum('.cursor/rules/a.md', 'x\n') })).toEqual({
      stale: [],
      kept: [],
    });
    expect(existsSync(join(outside, 'elsewhere/rules/a.md'))).toBe(true);
  });

  it('ignores a path that is now a symlink, whatever it points to', async () => {
    await writeFileAtomic(join(outside, 'target.md'), 'x\n');
    mkdirSync(join(root, '.cursor/rules'), { recursive: true });
    symlinkSync(join(outside, 'target.md'), join(root, '.cursor/rules/a.md'));

    expect(await plan({ '.cursor/rules/a.md': checksum('.cursor/rules/a.md', 'x\n') })).toEqual({
      stale: [],
      kept: [],
    });
    expect(existsSync(join(outside, 'target.md'))).toBe(true);
  });
});

describe('planRemovedOutputs with a plugin descriptor', () => {
  beforeAll(async () => {
    const mod = (await import(RICH_PLUGIN)) as { descriptor: TargetDescriptor };
    registerTargetDescriptor(mod.descriptor);
  });

  afterAll(() => resetRegistry());

  it('keeps the plugin’s shared config and lists its other outputs once it is removed', async () => {
    const lock = {
      ...(await generated('.rich/mcp.json', '{}\n')),
      ...(await generated('.rich/rules/a.md')),
      ...(await generated('.rich/ROOT.md')),
    };

    expect(await plan(lock)).toEqual({
      stale: ['.rich/ROOT.md', '.rich/rules/a.md'],
      kept: [{ path: '.rich/mcp.json', reason: 'shared' }],
    });
  });

  it('leaves the plugin’s outputs to the stale sweep while it is configured', async () => {
    const lock = {
      ...(await generated('.rich/mcp.json', '{}\n')),
      ...(await generated('.rich/rules/a.md')),
    };

    expect(await plan(lock, { configuredTargets: ['claude-code', 'rich-plugin'] })).toEqual({
      stale: [],
      kept: [],
    });
  });
});

function tree(dir: string, base = dir): string[] {
  const rel = (path: string): string => path.slice(base.length + 1).replaceAll('\\', '/');
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? [`${rel(join(dir, e.name))}/`, ...tree(join(dir, e.name), base)]
        : [rel(join(dir, e.name))],
    )
    .sort();
}

describe('deleteRemovedOutputs', () => {
  it('deletes the files and the directories that became empty', async () => {
    await generated('.cursor/rules/general.mdc');
    await generated('.cursor/skills/lessons/SKILL.md');

    await deleteRemovedOutputs(root, [
      '.cursor/rules/general.mdc',
      '.cursor/skills/lessons/SKILL.md',
    ]);

    expect(tree(root)).toEqual([]);
  });

  it('keeps every directory that still holds another file', async () => {
    await generated('.cursor/rules/general.mdc');
    await generated('.cursor/rules/mine.mdc');
    await generated('.cursor/skills/lessons/SKILL.md');

    await deleteRemovedOutputs(root, [
      '.cursor/rules/general.mdc',
      '.cursor/skills/lessons/SKILL.md',
    ]);

    expect(tree(root)).toEqual(['.cursor/', '.cursor/rules/', '.cursor/rules/mine.mdc']);
  });

  it('never removes the project root, the canonical dir or an unrelated empty dir', async () => {
    mkdirSync(join(root, '.agentsmesh'));
    mkdirSync(join(root, 'empty-before'));
    await generated('stale-at-root.md');

    await deleteRemovedOutputs(root, ['stale-at-root.md']);

    expect(existsSync(root)).toBe(true);
    expect(tree(root)).toEqual(['.agentsmesh/', 'empty-before/']);
  });

  it('skips a file that is already gone', async () => {
    await generated('.cursor/rules/a.mdc');

    await deleteRemovedOutputs(root, ['.cursor/rules/missing.mdc', '.cursor/rules/a.mdc']);

    expect(tree(root)).toEqual([]);
  });
});
