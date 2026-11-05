/**
 * A pack or extend that ships permissions or hooks must not wipe the ones a
 * user already has in a tool while their own permissions.yaml / hooks.yaml
 * leave the feature unmanaged.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../../src/cli/commands/init.js';
import { runInstall } from '../../src/install/run/run-install.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { runImport } from '../../src/cli/commands/import.js';
import { logger } from '../../src/utils/output/logger.js';

const ROOT = join(tmpdir(), 'am-install-perms-hooks-unmanaged-integration');
const HOME = join(ROOT, 'home');
const WORKSPACE = join(ROOT, 'workspace');
const PACK = join(ROOT, 'pack');

const USER_PERMISSIONS = { allow: ['Bash(ls)'], deny: ['Bash(rm)'] };
const USER_HOOKS = {
  PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo mine' }] }],
};
const USER_SETTINGS = { permissions: USER_PERMISSIONS, hooks: USER_HOOKS, theme: 'dark' };
const PACK_HOOK = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pack' }] };
const SKIPPED = [
  'Skipped permissions from installed packs or extends: allow Read.',
  'Skipped hooks from installed packs or extends: PreToolUse (1 hook).',
];

let warn: MockInstance<typeof logger.warn>;

function skippedWarnings(): string[] {
  return warn.mock.calls
    .map(([msg]) => String(msg))
    .filter((msg) => msg.includes('Skipped permissions') || msg.includes('Skipped hooks'))
    .map((msg) => msg.slice('[agentsmesh] '.length, msg.indexOf('.') + 1));
}

interface Settings {
  permissions?: unknown;
  hooks?: unknown;
  theme?: unknown;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readSettings(path: string): Settings {
  return JSON.parse(readFileSync(path, 'utf8')) as Settings;
}

function writePack(dir: string): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(dir, '.agentsmesh', 'rules', 'demo.md'),
    '---\ndescription: Demo rule\n---\n# Demo\n',
  );
  writeFileSync(join(dir, '.agentsmesh', 'permissions.yaml'), 'allow:\n  - Read\n');
  writeFileSync(
    join(dir, '.agentsmesh', 'hooks.yaml'),
    'PreToolUse:\n  - matcher: Bash\n    type: command\n    command: echo pack\n',
  );
}

function writeProject(project: string): void {
  mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(project, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, permissions, hooks]\nextends: []\n',
  );
  writeFileSync(join(project, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# R\n');
}

describe('permissions and hooks from packs and extends while canonical is unmanaged', () => {
  beforeEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(WORKSPACE, { recursive: true });
    writePack(PACK);
    vi.stubEnv('HOME', HOME);
    vi.stubEnv('USERPROFILE', HOME);
    warn = vi.spyOn(logger, 'warn');
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
    rmSync(ROOT, { recursive: true, force: true });
  });

  it('install --global keeps the permissions and hooks a user has in their tool', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code'] });
    writeJson(join(HOME, '.claude', 'settings.json'), USER_SETTINGS);

    await runInstall({ global: true, force: true, name: 'p' }, [PACK], WORKSPACE);

    expect(readSettings(join(HOME, '.claude', 'settings.json'))).toEqual(USER_SETTINGS);
    expect(skippedWarnings()).toEqual(SKIPPED);
  });

  it('import --global opts in: the pack values join the ones the tool had', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code'] });
    writeJson(join(HOME, '.claude', 'settings.json'), USER_SETTINGS);
    await runInstall({ global: true, force: true, name: 'p' }, [PACK], WORKSPACE);

    await runImport({ from: 'claude-code', global: true }, WORKSPACE);
    await runGenerate({ global: true }, WORKSPACE, { printMatrix: false });

    expect(readSettings(join(HOME, '.claude', 'settings.json'))).toEqual({
      permissions: { allow: ['Read', 'Bash(ls)'], deny: ['Bash(rm)'] },
      hooks: { ...USER_HOOKS, PreToolUse: [PACK_HOOK] },
      theme: 'dark',
    });
  });

  it('a local extend keeps the permissions and hooks a user has in their tool (global)', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code'] });
    const configPath = join(HOME, '.agentsmesh', 'agentsmesh.yaml');
    const extend = `extends:\n  - name: base\n    source: ${JSON.stringify(PACK)}\n    features: [permissions, hooks]\n`;
    writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}${extend}`);
    writeJson(join(HOME, '.claude', 'settings.json'), USER_SETTINGS);

    await runGenerate({ global: true }, WORKSPACE, { printMatrix: false });

    expect(readSettings(join(HOME, '.claude', 'settings.json'))).toEqual(USER_SETTINGS);
    expect(skippedWarnings()).toEqual(SKIPPED);
  });

  it('project install keeps a hand-written .claude/settings.json', async () => {
    const project = join(ROOT, 'project');
    writeProject(project);
    writeJson(join(project, '.claude', 'settings.json'), USER_SETTINGS);

    await runInstall({ force: true, name: 'p' }, [PACK], project);

    expect(readSettings(join(project, '.claude', 'settings.json'))).toEqual(USER_SETTINGS);
    expect(skippedWarnings()).toEqual(SKIPPED);
  });

  it('project install still adds pack values to managed permissions and hooks', async () => {
    const project = join(ROOT, 'project');
    writeProject(project);
    writeFileSync(
      join(project, '.agentsmesh', 'permissions.yaml'),
      'allow:\n  - Bash(ls)\ndeny:\n  - Bash(rm)\n',
    );
    writeFileSync(
      join(project, '.agentsmesh', 'hooks.yaml'),
      'PostToolUse:\n  - matcher: Write\n    type: command\n    command: echo mine\n',
    );

    await runInstall({ force: true, name: 'p' }, [PACK], project);

    const settings = readSettings(join(project, '.claude', 'settings.json'));
    expect(settings.permissions).toEqual({
      allow: ['Read', 'Bash(ls)'],
      deny: ['Bash(rm)'],
    });
    expect(settings.hooks).toEqual({
      PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo mine' }] }],
      PreToolUse: [PACK_HOOK],
    });
    expect(skippedWarnings()).toEqual([]);
  });
});
