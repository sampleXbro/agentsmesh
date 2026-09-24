/**
 * The recall hook command follows how the project installs agentsmesh, and a
 * re-run keeps the managed entries current (command and matcher) while leaving
 * user hooks and comments alone.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  injectRecallHook,
  isRecallHookCommand,
} from '../../../src/lessons/recall-hook-scaffold.js';

const NPX = 'npx --no --offline agentsmesh lessons hook';
const BARE = 'agentsmesh lessons hook';
const MATCHER = 'Edit|Write|NotebookEdit|Bash|PowerShell';
const EVENTS = ['PreToolUse', 'UserPromptSubmit', 'PostToolUseFailure', 'SessionStart'] as const;

let root: string;
const hooksPath = (): string => join(root, '.agentsmesh', 'hooks.yaml');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recallhook-inv-'));
  mkdirSync(join(root, '.agentsmesh'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function devDependency(): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ devDependencies: { agentsmesh: '^0.41.0' } }),
  );
}

type Entry = { matcher?: string; type?: string; command?: string; timeout?: number };
function parsed(): Record<string, Entry[]> {
  return parseYaml(readFileSync(hooksPath(), 'utf8')) as Record<string, Entry[]>;
}

describe('injectRecallHook — invocation', () => {
  it('launches the project copy through npx when agentsmesh is a project dependency', () => {
    devDependency();
    writeFileSync(hooksPath(), '# hooks\n', 'utf8');
    expect(injectRecallHook(root)).toBe(true);
    const hooks = parsed();
    expect(Object.keys(hooks).sort()).toEqual([...EVENTS].sort());
    for (const event of EVENTS) expect(hooks[event]!.map((h) => h.command)).toEqual([NPX]);
  });

  it('keeps the bare command when the project does not depend on agentsmesh', () => {
    writeFileSync(hooksPath(), '# hooks\n', 'utf8');
    expect(injectRecallHook(root)).toBe(true);
    for (const event of EVENTS) expect(parsed()[event]!.map((h) => h.command)).toEqual([BARE]);
  });

  it('rewrites the managed entries in place after agentsmesh becomes a devDependency', () => {
    writeFileSync(
      hooksPath(),
      [
        '# yaml-language-server: $schema=./schema.json',
        '# team hooks below',
        'PreToolUse:',
        '  - matcher: Edit',
        '    type: command',
        '    command: npm run lint # keep me',
        '  - matcher: Edit|Write|Bash',
        '    type: command',
        `    command: ${BARE}`,
        '    timeout: 5000',
        '',
      ].join('\n'),
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    devDependency();
    expect(injectRecallHook(root)).toBe(true);

    const text = readFileSync(hooksPath(), 'utf8');
    expect(text).toContain('# yaml-language-server: $schema=./schema.json');
    expect(text).toContain('# team hooks below');
    expect(text).toContain('npm run lint # keep me');
    const hooks = parsed();
    expect(hooks.PreToolUse).toEqual([
      { matcher: 'Edit', type: 'command', command: 'npm run lint' },
      { matcher: MATCHER, type: 'command', command: NPX, timeout: 5000 },
    ]);
    for (const event of EVENTS) {
      expect(hooks[event]!.filter((h) => isRecallHookCommand(h.command ?? ''))).toHaveLength(1);
    }
    expect(text).not.toContain(`command: ${BARE}`);
    expect(injectRecallHook(root)).toBe(false);
  });

  it('switches back to the bare command when the dependency is removed', () => {
    devDependency();
    writeFileSync(hooksPath(), '', 'utf8');
    injectRecallHook(root);
    rmSync(join(root, 'package.json'));
    expect(injectRecallHook(root)).toBe(true);
    for (const event of EVENTS) expect(parsed()[event]!.map((h) => h.command)).toEqual([BARE]);
  });

  it('collapses duplicate managed entries into one and upgrades an old matcher', () => {
    writeFileSync(
      hooksPath(),
      [
        'PreToolUse:',
        '  - matcher: Edit|Write|Bash',
        '    type: command',
        `    command: ${BARE}`,
        '  - matcher: Edit|Write|Bash',
        '    type: command',
        `    command: ${NPX}`,
        '',
      ].join('\n'),
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    expect(parsed().PreToolUse).toEqual([{ matcher: MATCHER, type: 'command', command: BARE }]);
  });

  it('leaves a user command that only mentions the recall hook alone', () => {
    const custom = 'agentsmesh lessons hook --debug 2>>/tmp/recall.log';
    writeFileSync(
      hooksPath(),
      `PreToolUse:\n  - matcher: Bash\n    type: command\n    command: ${custom}\n`,
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    expect(parsed().PreToolUse!.map((h) => h.command)).toEqual([custom, BARE]);
    expect(parsed().PreToolUse![0]!.matcher).toBe('Bash');
  });
});

describe('isRecallHookCommand', () => {
  it('matches every launcher form of the recall hook', () => {
    expect(isRecallHookCommand(BARE)).toBe(true);
    expect(isRecallHookCommand(NPX)).toBe(true);
    expect(isRecallHookCommand('agentsmesh lessons hook --debug')).toBe(true);
    expect(isRecallHookCommand('npm run lint')).toBe(false);
    expect(isRecallHookCommand('agentsmesh lessons query')).toBe(false);
  });
});
