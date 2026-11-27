/**
 * End-to-end guard for the directory sweep.
 *
 * `managedOutputs.dirs` is swept recursively and everything found that the run
 * did not emit used to be deleted — including files the tool itself or the user
 * wrote. These tests drive the real CLI so the lock, the sweep and the ordering
 * between them (cleanup reads the PREVIOUS run's lock) are all exercised.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, createTestProject } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';

function write(dir: string, relPath: string, content: string): void {
  const abs = join(dir, relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

function project(dir: string, targets: string[], features: string[]): void {
  write(
    dir,
    'agentsmesh.yaml',
    `version: 1\ntargets:\n${targets.map((t) => `  - ${t}\n`).join('')}features:\n${features
      .map((f) => `  - ${f}\n`)
      .join('')}`,
  );
  write(dir, '.agentsmesh/rules/_root.md', '# Root\n\nRoot guidance.\n');
}

describe('generate preserves files inside managed dirs that it never wrote', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('keeps a Kiro-authored hook on the very first run (no lock yet)', async () => {
    dir = createTestProject();
    project(dir, ['kiro'], ['rules']);
    write(dir, '.kiro/hooks/my-hook.kiro.hook', '{"name":"mine"}\n');

    const result = await runCli('generate', dir);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, '.kiro/hooks/my-hook.kiro.hook'), 'utf8')).toBe(
      '{"name":"mine"}\n',
    );
  });

  it('keeps that hook on later runs too, once a lock exists', async () => {
    dir = createTestProject();
    project(dir, ['kiro'], ['rules']);

    await runCli('generate', dir);
    write(dir, '.kiro/hooks/my-hook.kiro.hook', '{"name":"mine"}\n');
    const result = await runCli('generate', dir);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, '.kiro/hooks/my-hook.kiro.hook'))).toBe(true);
  });

  it('still evicts a renamed rule’s previous output', async () => {
    dir = createTestProject();
    project(dir, ['cursor'], ['rules']);
    write(dir, '.agentsmesh/rules/typescript.md', '# TS\n\nUse strict mode.\n');
    await runCli('generate', dir);
    expect(existsSync(join(dir, '.cursor/rules/typescript.mdc'))).toBe(true);

    const { renameSync } = await import('node:fs');
    renameSync(join(dir, '.agentsmesh/rules/typescript.md'), join(dir, '.agentsmesh/rules/ts.md'));
    const result = await runCli('generate', dir);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, '.cursor/rules/ts.mdc'))).toBe(true);
    expect(existsSync(join(dir, '.cursor/rules/typescript.mdc'))).toBe(false);
  });

  it('does not delete another target’s outputs on a filtered run', async () => {
    dir = createTestProject();
    project(dir, ['amp', 'zed'], ['rules', 'agents']);
    write(
      dir,
      '.agentsmesh/agents/reviewer.md',
      '---\nname: reviewer\ndescription: Reviews code\n---\n\nReview it.\n',
    );
    await runCli('generate', dir);
    const shared = join(dir, '.agents/skills/am-agent-reviewer/SKILL.md');
    expect(existsSync(shared)).toBe(true);

    const result = await runCli('generate --targets zed', dir);

    expect(result.exitCode).toBe(0);
    expect(existsSync(shared)).toBe(true);
  });

  it('still evicts a projected agent skill it generated once conversion is off', async () => {
    dir = createTestProject();
    project(dir, ['windsurf'], ['rules', 'agents', 'skills']);
    write(
      dir,
      '.agentsmesh/agents/reviewer.md',
      '---\nname: reviewer\ndescription: Reviews code\n---\n\nReview it.\n',
    );
    await runCli('generate', dir);
    const projected = join(dir, '.windsurf/skills/am-agent-reviewer/SKILL.md');
    expect(existsSync(projected)).toBe(true);

    write(
      dir,
      'agentsmesh.yaml',
      'version: 1\ntargets:\n  - windsurf\nfeatures:\n  - rules\n  - agents\n  - skills\n' +
        'conversions:\n  agents_to_skills:\n    windsurf: false\n',
    );
    const result = await runCli('generate', dir);

    expect(result.exitCode).toBe(0);
    expect(existsSync(projected)).toBe(false);
  });

  it('still reports real drift through generate --check', async () => {
    dir = createTestProject('canonical-full');
    await runCli('generate', dir);
    writeFileSync(join(dir, 'CLAUDE.md'), '# Drifted\n');

    const result = await runCli('generate --check', dir);

    expect(result.exitCode).toBe(1);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# Drifted\n');
  });

  // Surfaced, but never as drift: `generate` cannot remove the file, so exiting 1
  // would be a permanently red gate with no remedy the CLI can print.
  it('surfaces an unlocked managed-dir file as a notice without failing `check`', async () => {
    dir = createTestProject();
    project(dir, ['cursor'], ['rules']);
    await runCli('generate', dir);
    write(dir, '.cursor/rules/orphaned.mdc', 'hand written\n');

    const result = await runCli('check', dir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toContain('.cursor/rules/orphaned.mdc');
    expect(result.stdout + result.stderr).toContain('not written by agentsmesh');
    expect(existsSync(join(dir, '.cursor/rules/orphaned.mdc'))).toBe(true);
  });
});
