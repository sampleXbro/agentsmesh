import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runConvert } from '../../src/cli/commands/convert.js';
import { cleanupStaleGeneratedOutputs } from '../../src/core/generate/stale-cleanup.js';

let fixture: string;
let project: string;
let outside: string;

beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'am-convert-containment-'));
  project = join(fixture, 'project');
  outside = join(fixture, 'outside');
  await Promise.all([mkdir(project), mkdir(outside)]);
});

afterEach(async () => {
  await rm(fixture, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32')('conversion and cleanup symlink containment', () => {
  it('rejects conversion through an external output-directory symlink', async () => {
    const source = '# Root\n\nUse TypeScript.\n';
    await writeFile(join(project, 'CLAUDE.md'), source);
    await mkdir(join(outside, 'rules'));
    await writeFile(join(outside, 'rules', 'root.mdc'), 'external rule\n');
    await symlink(outside, join(project, '.cursor'), 'dir');

    await expect(runConvert({ from: 'claude-code', to: 'cursor' }, project)).rejects.toThrow(
      /Unsafe filesystem path/,
    );

    expect(await readFile(join(outside, 'rules', 'root.mdc'), 'utf8')).toBe('external rule\n');
    expect(await readdir(outside, { recursive: true })).toEqual(['rules', 'rules/root.mdc']);
    expect((await readdir(project)).sort()).toEqual(['.cursor', 'CLAUDE.md']);
    expect(await readFile(join(project, 'CLAUDE.md'), 'utf8')).toBe(source);
    expect((await lstat(join(project, '.cursor'))).isSymbolicLink()).toBe(true);
  });

  it.each(['file', 'dir'] as const)(
    'unlinks a stale %s symlink without changing its external destination',
    async (kind) => {
      const rules = join(project, '.claude', 'rules');
      await mkdir(rules, { recursive: true });
      await writeFile(join(outside, 'keep.md'), 'external content\n');
      const destination = kind === 'file' ? join(outside, 'keep.md') : outside;
      await symlink(destination, join(rules, 'stale.md'), kind);

      await cleanupStaleGeneratedOutputs({
        projectRoot: project,
        targets: ['claude-code'],
        expectedPaths: [],
        generatedOutputs: ['.claude/rules/stale.md'],
      });

      expect(await readdir(rules)).toEqual([]);
      expect(await readdir(outside)).toEqual(['keep.md']);
      expect(await readFile(join(outside, 'keep.md'), 'utf8')).toBe('external content\n');
    },
  );
});
