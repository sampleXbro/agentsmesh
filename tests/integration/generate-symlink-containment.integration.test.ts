import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { cleanupStaleGeneratedOutputs } from '../../src/core/generate/stale-cleanup.js';
import { registerTargetDescriptor, resetRegistry } from '../../src/targets/catalog/registry.js';
import type { TargetDescriptor } from '../../src/targets/catalog/target-descriptor.js';

let sandbox: string;
let project: string;
let outside: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'am-output-containment-'));
  project = join(sandbox, 'project');
  outside = join(sandbox, 'outside');
  await mkdir(join(project, '.agentsmesh/rules'), { recursive: true });
  await mkdir(outside);
  const mod: { descriptor: unknown } = await import('../fixtures/plugins/rich-plugin/index.js');
  registerTargetDescriptor(mod.descriptor as TargetDescriptor);
});

afterEach(async () => {
  resetRegistry();
  await rm(sandbox, { recursive: true, force: true });
});

async function seed(target: string): Promise<void> {
  await writeFile(
    join(project, 'agentsmesh.yaml'),
    JSON.stringify({
      version: 1,
      targets: target === 'rich-plugin' ? [] : [target],
      pluginTargets: target === 'rich-plugin' ? [target] : [],
      features: ['rules'],
    }),
  );
  await writeFile(join(project, '.agentsmesh/rules/_root.md'), '---\nroot: true\n---\nRoot\n');
  await writeFile(
    join(project, '.agentsmesh/rules/style.md'),
    '---\ndescription: Style\n---\nNew rule\n',
  );
}

describe.skipIf(process.platform === 'win32').each([
  { target: 'claude-code', dir: '.claude', rootFile: 'CLAUDE.md' },
  { target: 'rich-plugin', dir: '.rich', rootFile: '.rich/ROOT.md' },
])('generated output containment: $target', ({ target, dir, rootFile }) => {
  it('rejects external output directories before writing any output', async () => {
    await seed(target);
    await mkdir(join(outside, 'rules'));
    await writeFile(join(outside, 'rules/style.md'), 'External rule');
    await symlink(outside, join(project, dir), 'junction');

    await expect(runGenerate({}, project, { printMatrix: false })).rejects.toThrow(/Unsafe/);
    expect(await readFile(join(outside, 'rules/style.md'), 'utf8')).toBe('External rule');
    expect(await readdir(outside)).toEqual(['rules']);
    await expect(readFile(join(project, rootFile))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects stale deletion through an external managed-directory symlink', async () => {
    await mkdir(join(project, dir));
    await writeFile(join(outside, 'old.md'), 'External rule');
    await symlink(outside, join(project, dir, 'rules'), 'junction');

    await expect(
      cleanupStaleGeneratedOutputs({
        projectRoot: project,
        targets: [target],
        expectedPaths: [],
        generatedOutputs: [`${dir}/rules/old.md`],
      }),
    ).rejects.toThrow(/Unsafe/);
    expect(await readFile(join(outside, 'old.md'), 'utf8')).toBe('External rule');
  });

  it('allows output directories and project roots symlinked within the boundary', async () => {
    await seed(target);
    const internal = join(project, 'native');
    await mkdir(internal);
    await symlink(internal, join(project, dir), 'junction');
    const alias = join(sandbox, 'alias');
    await symlink(project, alias, 'junction');

    expect((await runGenerate({}, alias, { printMatrix: false })).exitCode).toBe(0);
    expect(await readFile(join(internal, 'rules/style.md'), 'utf8')).toContain('New rule');
  });
});

it.skipIf(process.platform === 'win32')(
  'preserves an external superseded root file behind a symlinked parent',
  async () => {
    await writeFile(join(outside, 'CLAUDE.md'), 'External root');
    await symlink(outside, join(project, '.claude'), 'junction');
    await expect(
      cleanupStaleGeneratedOutputs({
        projectRoot: project,
        targets: ['claude-code'],
        expectedPaths: ['CLAUDE.md'],
        generatedOutputs: [],
      }),
    ).rejects.toThrow(/Unsafe/);
    expect(await readFile(join(outside, 'CLAUDE.md'), 'utf8')).toBe('External root');
  },
);
