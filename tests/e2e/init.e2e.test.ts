/**
 * E2E tests for agentsmesh init.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './helpers/run-cli.js';
import { createTestProject, cleanup } from './helpers/setup.js';
import { fileExists, fileContains } from './helpers/assertions.js';

describe('init', () => {
  let dir: string;

  afterEach(() => {
    if (dir) cleanup(dir);
  });

  it('init in empty dir — run ab init → agentsmesh.yaml exists, .agentsmesh/rules/_root.md exists', async () => {
    dir = createTestProject();
    const r = await runCli('init', dir);
    expect(r.exitCode).toBe(0);
    fileExists(join(dir, 'agentsmesh.yaml'));
    fileExists(join(dir, '.agentsmesh', 'rules', '_root.md'));
    fileContains(join(dir, 'agentsmesh.yaml'), 'version');
    fileContains(join(dir, '.agentsmesh', 'rules', '_root.md'), 'root');
  });

  it('init detects Claude config — without --yes it refuses instead of overwriting it', async () => {
    dir = createTestProject('claude-code-project');
    const r = await runCli('init', dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Found existing configurations: claude-code.');
    expect(r.stderr).toContain('agentsmesh init --yes');
    expect(existsSync(join(dir, 'agentsmesh.yaml'))).toBe(false);
  });

  it('init detects multiple tools — copy claude + cursor fixtures, run init in fresh empty dir with both', async () => {
    dir = createTestProject();
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project rules');
    const cursorRulesDir = join(dir, '.cursor', 'rules');
    mkdirSync(cursorRulesDir, { recursive: true });
    writeFileSync(join(cursorRulesDir, 'root.mdc'), '---\nalwaysApply: true\n---\n# Cursor');
    const r = await runCli('init', dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Found existing configurations: claude-code, cursor.');
  });

  it('init refuses if config exists — create yaml first → run init → exit 1', async () => {
    dir = createTestProject();
    writeFileSync(join(dir, 'agentsmesh.yaml'), 'version: 1\n');
    const r = await runCli('init', dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Already initialized');
  });

  it('gitignore updated — run init → .gitignore contains agentsmesh.local.yaml', async () => {
    dir = createTestProject();
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    const r = await runCli('init', dir);
    expect(r.exitCode).toBe(0);
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('agentsmesh.local.yaml');
  });

  it('init creates .gitignore when missing', async () => {
    dir = createTestProject();
    const r = await runCli('init', dir);
    expect(r.exitCode).toBe(0);
    fileExists(join(dir, '.gitignore'));
    fileContains(join(dir, '.gitignore'), 'agentsmesh.local.yaml');
    fileContains(join(dir, '.gitignore'), '.agentsmeshcache');
    fileContains(join(dir, '.gitignore'), '.agentsmesh/.lock.tmp');
  });

  it('init --global writes the global scaffold under $HOME/.agentsmesh', async () => {
    dir = createTestProject();
    const fakeHome = join(dir, 'home');
    mkdirSync(fakeHome, { recursive: true });

    const r = await runCli('init --global', dir, { HOME: fakeHome });
    expect(r.exitCode, r.stderr).toBe(0);
    fileExists(join(fakeHome, '.agentsmesh', 'agentsmesh.yaml'));
    fileExists(join(fakeHome, '.agentsmesh', 'rules', '_root.md'));
  });

  it('init --yes auto-imports detected configs and scaffolds empty paths', async () => {
    dir = createTestProject();
    writeFileSync(join(dir, 'CLAUDE.md'), '# Existing project rules\n');

    const r = await runCli('init --yes', dir);
    expect(r.exitCode, r.stderr).toBe(0);
    fileExists(join(dir, 'agentsmesh.yaml'));
    fileExists(join(dir, '.agentsmesh', 'rules', '_root.md'));
    expect(r.stdout + r.stderr).toMatch(/claude|Imported|Found/i);
  });
});
