/**
 * E2E: `agentsmesh init --lessons` against the real CLI binary.
 *
 * The lessons ritual is canonical content wrapped in managed-block sentinels
 * (`<!-- agentsmesh:lessons-contract:start -->`). init injects it into
 * `.agentsmesh/rules/_root.md` and creates `lessons.json`; generate then
 * projects the block to every target.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { runCli } from './helpers/run-cli.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'am-init-lessons-e2e-'));
});

afterEach(() => {
  if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
});

describe('agentsmesh init --lessons (e2e)', () => {
  it('fresh init + lessons in one shot; ritual block lands in canonical _root.md', async () => {
    const result = await runCli('init --lessons', tempDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created agentsmesh.yaml');
    expect(result.stdout).toContain('Lessons subsystem ready');

    expect(existsSync(join(tempDir, 'agentsmesh.yaml'))).toBe(true);
    expect(existsSync(join(tempDir, '.agentsmesh/lessons/lessons.json'))).toBe(true);

    // Team merge driver: the committable .gitattributes binding is written. This
    // folder is not a git repo, so there is no per-clone config to set yet.
    expect(readFileSync(join(tempDir, '.gitattributes'), 'utf8')).toContain(
      '.agentsmesh/lessons/lessons.json merge=agentsmesh-lessons',
    );
    expect(result.stdout).not.toContain('merge driver for this clone');

    const rootRule = readFileSync(join(tempDir, '.agentsmesh/rules/_root.md'), 'utf8');
    expect(rootRule).toContain('<!-- agentsmesh:lessons-contract:start -->');
    expect(rootRule).toContain('**Recall');
    expect(rootRule).toContain('**Capture');
    // The ritual leads the body, after frontmatter, above any other content.
    expect(rootRule).toContain('---\n\n<!-- agentsmesh:lessons-contract:start -->');
  });

  it('sets up the per-clone merge driver itself inside a git repo', async () => {
    // Hook-exported git variables would point git at another repo.
    const gitEnv = {
      GIT_DIR: undefined,
      GIT_INDEX_FILE: undefined,
      GIT_WORK_TREE: undefined,
      GIT_CONFIG_GLOBAL: join(tempDir, 'no-global-gitconfig'),
      GIT_CONFIG_NOSYSTEM: '1',
    };
    const project = join(tempDir, 'repo');
    mkdirSync(project);
    expect(
      spawnSync('git', ['init', '-q'], { cwd: project, env: { ...process.env, ...gitEnv } }).status,
    ).toBe(0);
    // The driver is only enabled when its program is on PATH; a shim makes that deterministic.
    const bin = join(tempDir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'agentsmesh'), '#!/bin/sh\n', { mode: 0o755 });
    const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    const env = { ...gitEnv, [pathKey]: `${bin}${delimiter}${process.env[pathKey] ?? ''}` };

    const result = await runCli('init --lessons', project, env);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Enabled the lessons.json merge driver for this clone');
    const driver = spawnSync(
      'git',
      ['config', '--local', '--get', 'merge.agentsmesh-lessons.driver'],
      {
        cwd: project,
        encoding: 'utf8',
        env: { ...process.env, ...gitEnv },
      },
    );
    expect(driver.stdout.trim()).toBe('agentsmesh lessons merge-driver %O %A %B');
  });

  it('generate projects both managed blocks at the TOP of the target root file', async () => {
    await runCli('init --lessons', tempDir);
    const gen = await runCli('generate --targets claude-code', tempDir);
    expect(gen.exitCode).toBe(0);

    const claude = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('<!-- agentsmesh:lessons-contract:start -->');
    expect(claude).toContain('agentsmesh lessons query');
    // Generation Contract first, then the lessons ritual — both ahead of any
    // user content / document headings.
    expect(claude.startsWith('<!-- agentsmesh:root-generation-contract:start -->')).toBe(true);
    const contractEnd = claude.indexOf('<!-- agentsmesh:root-generation-contract:end -->');
    const lessonsStart = claude.indexOf('<!-- agentsmesh:lessons-contract:start -->');
    const body = claude.indexOf('# Project Rules');
    expect(contractEnd).toBeLessThan(lessonsStart);
    expect(lessonsStart).toBeGreaterThan(-1);
    expect(lessonsStart).toBeLessThan(body);
  });

  it('auto-wires the PreToolUse recall hook, never PostToolUse, and generate projects it', async () => {
    const init = await runCli('init --lessons', tempDir);
    expect(init.stdout).toContain('recall hook into .agentsmesh/hooks.yaml');

    const hooksYaml = readFileSync(join(tempDir, '.agentsmesh/hooks.yaml'), 'utf8');
    const parsed = parseYaml(hooksYaml) as Record<string, Array<{ command?: string }> | undefined>;
    expect((parsed.PreToolUse ?? []).map((h) => h.command)).toContain('agentsmesh lessons hook');
    // PreToolUse fires before every tool call, so a PostToolUse recall only re-ran
    // after the fact: a second process and context block per call, too late to apply.
    expect((parsed.PostToolUse ?? []).map((h) => h.command)).not.toContain(
      'agentsmesh lessons hook',
    );
    // The managed YAML injection preserved the schema directive.
    expect(hooksYaml).toContain('yaml-language-server');

    await runCli('generate --targets claude-code', tempDir);
    const settings = JSON.parse(readFileSync(join(tempDir, '.claude/settings.json'), 'utf8')) as {
      hooks?: Record<string, unknown>;
    };
    const recallEntries = (event: string): number =>
      JSON.stringify(settings.hooks?.[event] ?? []).split('agentsmesh lessons hook').length - 1;
    expect(recallEntries('PreToolUse')).toBe(1);
    expect(recallEntries('PostToolUse')).toBe(0);
  });

  it('retrofits lessons onto an already-initialized project', async () => {
    const first = await runCli('init', tempDir);
    expect(first.exitCode).toBe(0);
    expect(existsSync(join(tempDir, '.agentsmesh/lessons'))).toBe(false);

    const second = await runCli('init --lessons', tempDir);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('Lessons subsystem ready');

    expect(existsSync(join(tempDir, '.agentsmesh/lessons/lessons.json'))).toBe(true);
    const rootRule = readFileSync(join(tempDir, '.agentsmesh/rules/_root.md'), 'utf8');
    expect(rootRule).toContain('<!-- agentsmesh:lessons-contract:start -->');
  });

  it('is idempotent — re-running --lessons does not duplicate the block', async () => {
    await runCli('init --lessons', tempDir);
    const second = await runCli('init --lessons', tempDir);
    expect(second.exitCode).toBe(0);

    const rootRule = readFileSync(join(tempDir, '.agentsmesh/rules/_root.md'), 'utf8');
    const starts = rootRule.match(/<!-- agentsmesh:lessons-contract:start -->/g) ?? [];
    expect(starts.length).toBe(1);
  });

  it('errors when --lessons is combined with --global', async () => {
    const result = await runCli('init --lessons --global', tempDir);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/project-mode only/i);
  });

  it('still errors on bare init when project is already initialized', async () => {
    await runCli('init', tempDir);
    const second = await runCli('init', tempDir);
    expect(second.exitCode).not.toBe(0);
    expect(second.stderr + second.stdout).toMatch(/Already initialized/i);
  });
});
