/**
 * Root-rule collision across targets.
 *
 * `.agentsmesh/rules/_root.md` is the one canonical slot every target's root
 * instruction collapses into. Two tools' root rules are distinct content that
 * merely share that slot, so a second import accumulates instead of replacing
 * — the rest of the canonical surface stays last-import-wins.
 *
 * Regression guard: `init --yes` on a repo holding both `CLAUDE.md` and a
 * Cursor always-apply rule reported both imports as successful while keeping
 * only the Cursor body, and the next `generate` then rewrote the user's own
 * `CLAUDE.md` with it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const TEST_DIR = join(tmpdir(), 'am-integration-root-collision');
const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

function run(args: string, cwd = TEST_DIR): string {
  return execSync(`node ${CLI_PATH} ${args}`, { cwd, encoding: 'utf-8' });
}

function readRoot(cwd = TEST_DIR): string {
  return readFileSync(join(cwd, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
}

function seedTwoToolProject(dir: string): void {
  mkdirSync(join(dir, '.cursor', 'rules'), { recursive: true });
  writeFileSync(
    join(dir, '.cursor', 'rules', 'base.mdc'),
    '---\nalwaysApply: true\n---\n# Cursor rules\n- Use TypeScript strict mode.\n',
  );
  writeFileSync(join(dir, 'CLAUDE.md'), '# Claude rules\n- Prefer pnpm.\n');
}

describe('import: root-rule collision across targets (integration)', () => {
  it('init --yes keeps both tools’ root rules in one canonical root', () => {
    seedTwoToolProject(TEST_DIR);

    run('init --yes');

    const root = readRoot();
    expect(root).toContain('- Prefer pnpm.');
    expect(root).toContain('- Use TypeScript strict mode.');
  });

  it('init --yes then generate preserves the user’s own CLAUDE.md content', () => {
    seedTwoToolProject(TEST_DIR);

    run('init --yes');
    run('generate');

    const claudeMd = readFileSync(join(TEST_DIR, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('- Prefer pnpm.');
    expect(claudeMd).toContain('- Use TypeScript strict mode.');
  });

  it('sequential standalone imports accumulate both root rules', () => {
    run('init --yes');
    seedTwoToolProject(TEST_DIR);
    run('import --from claude-code');
    run('import --from cursor');

    const root = readRoot();
    expect(root).toContain('- Prefer pnpm.');
    expect(root).toContain('- Use TypeScript strict mode.');
  });

  it('accumulates in either import order', () => {
    run('init --yes');
    seedTwoToolProject(TEST_DIR);
    run('import --from cursor');
    run('import --from claude-code');

    const root = readRoot();
    expect(root).toContain('- Prefer pnpm.');
    expect(root).toContain('- Use TypeScript strict mode.');
  });

  it('re-importing the same target does not duplicate its root body', () => {
    run('init --yes');
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Claude rules\n- Prefer pnpm.\n');
    run('import --from claude-code');
    const first = readRoot();
    run('import --from claude-code');

    expect(readRoot()).toBe(first);
    expect(readRoot().match(/Prefer pnpm/g)).toHaveLength(1);
  });

  it('re-importing after the source gained a line adopts the longer body without duplicating', () => {
    run('init --yes');
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Claude rules\n- Prefer pnpm.\n');
    run('import --from claude-code');
    writeFileSync(
      join(TEST_DIR, 'CLAUDE.md'),
      '# Claude rules\n- Prefer pnpm.\n- Also run tests.\n',
    );
    run('import --from claude-code');

    const root = readRoot();
    expect(root).toContain('- Also run tests.');
    expect(root.match(/Prefer pnpm/g)).toHaveLength(1);
  });

  it('exposes the merge in --json for the second import only', () => {
    run('init --yes');
    seedTwoToolProject(TEST_DIR);

    const first = JSON.parse(run('import --from claude-code --json')) as {
      data: { rootRuleMerged: boolean };
    };
    const second = JSON.parse(run('import --from cursor --json')) as {
      data: { rootRuleMerged: boolean };
    };

    expect(first.data.rootRuleMerged).toBe(false);
    expect(second.data.rootRuleMerged).toBe(true);
  });

  it('accumulates through a bespoke importer too (gemini-cli writes its root directly)', () => {
    run('init --yes');
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Claude rules\n- Prefer pnpm.\n');
    writeFileSync(join(TEST_DIR, 'GEMINI.md'), '# Gemini rules\n- Keep functions small.\n');
    run('import --from claude-code');
    run('import --from gemini-cli');

    const root = readRoot();
    expect(root).toContain('- Prefer pnpm.');
    expect(root).toContain('- Keep functions small.');
  });

  it('reports the merge rather than claiming a plain overwrite', () => {
    run('init --yes');
    seedTwoToolProject(TEST_DIR);
    run('import --from claude-code');
    const output = run('import --from cursor');

    expect(output).toMatch(/merged/i);
  });
});
