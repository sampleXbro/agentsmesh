/**
 * `init --lessons` on a project that was initialized earlier must wire the
 * recall hook even when `.agentsmesh/hooks.yaml` was never created.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../../../src/cli/commands/init.js';
import { TEMPLATE_HOOKS } from '../../../../src/cli/commands/init-templates.js';

const EVENTS = ['PreToolUse', 'UserPromptSubmit', 'PostToolUseFailure', 'SessionStart'];

let dir: string;
let home: string;
const hooksPath = (): string => join(dir, '.agentsmesh', 'hooks.yaml');
const config = (features = ''): void =>
  writeFileSync(
    join(dir, 'agentsmesh.yaml'),
    `version: 1\ntargets:\n  - claude-code\n${features}`,
    'utf8',
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-init-retrofit-'));
  home = mkdtempSync(join(tmpdir(), 'am-init-retrofit-home-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  config();
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('runInit --lessons on an initialized project', () => {
  it('creates hooks.yaml with the scaffold header and wires the recall hook', async () => {
    expect(existsSync(hooksPath())).toBe(false);
    const result = await runInit(dir, { lessons: true });
    expect(result.data.lessons?.recallHook).toEqual({ status: 'created' });
    expect(result.data.lessons?.recallHookInjected).toBe(true);
    const text = readFileSync(hooksPath(), 'utf8');
    expect(text.startsWith(TEMPLATE_HOOKS)).toBe(true);
    expect(text).toMatch(/^# yaml-language-server: \$schema=\S+hooks\.json\n/);
    const hooks = parseYaml(text) as Record<string, Array<{ command: string }>>;
    expect(Object.keys(hooks).sort()).toEqual([...EVENTS].sort());
    for (const event of EVENTS) {
      expect(hooks[event]!.map((h) => h.command)).toEqual(['agentsmesh lessons hook']);
    }
  });

  it('reports current, and leaves hooks.yaml alone, on a second run', async () => {
    await runInit(dir, { lessons: true });
    const first = readFileSync(hooksPath(), 'utf8');
    const second = await runInit(dir, { lessons: true });
    expect(second.data.lessons?.recallHook).toEqual({ status: 'current' });
    expect(readFileSync(hooksPath(), 'utf8')).toBe(first);
  });

  it('keeps a matcher the user narrowed when init --lessons runs again', async () => {
    await runInit(dir, { lessons: true });
    const narrowed = readFileSync(hooksPath(), 'utf8').replace(
      'matcher: Edit|Write|NotebookEdit|Bash|PowerShell',
      'matcher: Edit|Write',
    );
    writeFileSync(hooksPath(), narrowed, 'utf8');
    const again = await runInit(dir, { lessons: true });
    expect(again.data.lessons?.recallHook).toEqual({ status: 'current' });
    expect(readFileSync(hooksPath(), 'utf8')).toBe(narrowed);
  });

  it('wires into a hooks.yaml that exists without the recall entries', async () => {
    mkdirSync(join(dir, '.agentsmesh'), { recursive: true });
    writeFileSync(hooksPath(), '# my hooks\n', 'utf8');
    const result = await runInit(dir, { lessons: true });
    expect(result.data.lessons?.recallHook).toEqual({ status: 'wired' });
    expect(readFileSync(hooksPath(), 'utf8')).toContain('# my hooks');
  });

  it('warns when hooks is not in features, because generate would drop the hook', async () => {
    config('features:\n  - rules\n  - mcp\n');
    const result = await runInit(dir, { lessons: true });
    expect(result.data.lessons?.hooksFeatureWarning).toContain(
      'Add `hooks` to `features` in agentsmesh.yaml',
    );
  });

  it('gives no hooks-feature warning when features is not set', async () => {
    const result = await runInit(dir, { lessons: true });
    expect(result.data.lessons?.hooksFeatureWarning).toBeNull();
  });
});
