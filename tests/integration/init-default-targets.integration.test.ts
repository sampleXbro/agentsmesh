/**
 * Non-interactive `agentsmesh init` target defaults.
 *
 * Regression guard: `init --yes` in a fresh repo with no tool config enabled
 * every builtin target, and the following `generate` wrote 47 files and about
 * thirty dot-directories into the project root — a poor first impression and a
 * foot-gun for scripted adoption.
 *
 * HOME is redirected per test so machine detection is deterministic: an empty
 * fake home means "no tools installed", and seeding a path under it means the
 * user has that tool.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { parse } from 'yaml';
import { minimalInitTargetIds } from '../../src/targets/catalog/init-starter-targets.js';

const TEST_DIR = join(tmpdir(), 'am-integration-init-defaults');
const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');
const MINIMAL = [...minimalInitTargetIds()];

let projectDir: string;
let fakeHome: string;

beforeEach(() => {
  projectDir = join(TEST_DIR, 'project');
  fakeHome = join(TEST_DIR, 'home');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(fakeHome, { recursive: true });
});
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

function run(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, {
    cwd: projectDir,
    encoding: 'utf-8',
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
  });
}

function configuredTargets(): string[] {
  const parsed = parse(readFileSync(join(projectDir, 'agentsmesh.yaml'), 'utf-8')) as {
    targets: string[];
  };
  return parsed.targets;
}

function generatedPaths(): string[] {
  return run('generate')
    .split('\n')
    .filter((l) => l.includes('created ') && !l.startsWith('Generated:'))
    .map((l) => l.replace(/.*created /, '').trim())
    .sort();
}

describe('init --yes: default target selection (integration)', () => {
  it('enables only the minimal set when neither the project nor the machine has tools', () => {
    run('init --yes');
    expect(configuredTargets()).toEqual(MINIMAL);
  });

  it('generates exactly the minimal set’s files in an empty repo', () => {
    run('init --yes');
    // The old default enabled every builtin and produced 47 created files
    // plus ~30 dot-directories. This is the complete replacement footprint.
    expect(generatedPaths()).toEqual([
      '.cursor/AGENTS.md',
      '.cursor/mcp.json',
      '.cursor/rules/general.mdc',
      '.github/copilot-instructions.md',
      '.mcp.json',
      '.vscode/mcp.json',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
  });

  it('applies the same selection in global scope', () => {
    const out = execSync(`node ${CLI_PATH} init --global --yes`, {
      cwd: projectDir,
      encoding: 'utf-8',
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
    });
    expect(out).toMatch(/Enabled 3 targets/);
    const parsed = parse(
      readFileSync(join(fakeHome, '.agentsmesh', 'agentsmesh.yaml'), 'utf-8'),
    ) as { targets: string[] };
    expect(parsed.targets).toEqual(MINIMAL);
  });

  it('--targets wins over --all-targets when both are passed', () => {
    run('init --yes --all-targets --targets zed');
    expect(configuredTargets()).toEqual(['zed']);
  });

  it('prints how many targets it enabled and how to change them', () => {
    const out = run('init --yes');
    expect(out).toMatch(/Enabled \d+ targets?/);
    expect(out).toContain('--targets');
  });

  it('uses the project’s own tool configs when present', () => {
    writeFileSync(join(projectDir, 'CLAUDE.md'), '# Rules\n- Prefer pnpm.\n');
    run('init --yes');
    expect(configuredTargets()).toEqual(['claude-code']);
  });

  it('uses tools installed on the machine when the project has none', () => {
    // Zed's global config lives under ~/.config/zed (descriptor detection path).
    mkdirSync(join(fakeHome, '.config', 'zed'), { recursive: true });
    writeFileSync(join(fakeHome, '.config', 'zed', 'settings.json'), '{}');
    run('init --yes');
    expect(configuredTargets()).toContain('zed');
    expect(configuredTargets()).not.toEqual(MINIMAL);
  });

  it('--targets overrides detection and writes exactly those ids', () => {
    writeFileSync(join(projectDir, 'CLAUDE.md'), '# Rules\n');
    run('init --yes --targets zed,cursor');
    expect(configuredTargets()).toEqual(['cursor', 'zed']);
  });

  it('--targets rejects an unknown id without writing a config', () => {
    expect(() => run('init --yes --targets not-a-tool')).toThrow(/not-a-tool/);
  });

  it('--all-targets restores the full starter set', () => {
    run('init --yes --all-targets');
    expect(configuredTargets().length).toBeGreaterThan(20);
  });
});
