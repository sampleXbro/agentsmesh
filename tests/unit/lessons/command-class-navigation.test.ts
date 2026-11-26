/**
 * A command whose only real program is `cd`, `pushd` or `popd` has no class: a
 * trigger on `cd` would be as broad as the old `\bsudo\b`, and a failed `cd` is
 * not an action a lesson can guard. A compound command still keys on the program
 * it really runs.
 */

import { describe, expect, it } from 'vitest';
import { triggerHint } from '../../../src/lessons/capture-trigger-hint.js';
import { commandClass } from '../../../src/lessons/command-class.js';
import { contextKey, normalizeCommand } from '../../../src/lessons/context-key.js';

const CMD_PLACEHOLDER = "--trigger-cmd '<regex matching the command>'";

describe('commandClass — navigation-only commands', () => {
  it.each([
    'cd /repo',
    'cd',
    'cd -',
    'cd "$HOME/my repo"',
    'pushd /repo',
    'popd',
    'cd src && cd ..',
    'cd /repo; pushd lib; popd',
    '(cd pkg)',
    'sudo cd /repo',
  ])('%j has no class', (command) => {
    expect(commandClass(command)).toBeNull();
  });

  it.each([
    ['cd /repo && pnpm tsc --noEmit', 'pnpm', 'tsc'],
    ['pushd lib && make build', 'make', 'build'],
    ['cd a || exit 1', 'exit', undefined],
  ])('%j still keys on the program it really runs', (command, program, subcommand) => {
    const cls = commandClass(command);
    expect(cls?.program).toBe(program);
    expect(cls?.subcommand).toBe(subcommand);
  });

  it('keeps the setup fallback for other shell setup commands', () => {
    expect(commandClass('export CI=1')).toEqual({ program: 'export', gapped: false });
    expect(commandClass('set -e')).toEqual({ program: 'set', gapped: false });
  });
});

describe('triggerHint — a failed cd-only command', () => {
  it.each(['cd /repo', 'pushd /repo', 'popd', 'cd /a && cd ..'])(
    'prints the command placeholder for %j',
    (command) => {
      expect(triggerHint({ command })).toBe(CMD_PLACEHOLDER);
    },
  );

  it('still suggests the real program of a compound command', () => {
    expect(triggerHint({ command: 'cd /repo && pnpm tsc --noEmit' })).toBe(
      "--trigger-cmd '\\bpnpm tsc\\b'",
    );
  });
});

describe('context key — a navigation-only command', () => {
  it('normalizes to an empty class, like a command that runs no program', () => {
    expect(normalizeCommand('cd /repo')).toBe('');
    expect(normalizeCommand('cd src && cd ..')).toBe('');
    expect(normalizeCommand('FOO=bar')).toBe('');
  });

  it('gives a delivery and a later failure of the same cd the same key', () => {
    expect(contextKey({ command: 'cd /repo' }, '/proj')).toBe('cmd:');
    expect(contextKey({ command: 'cd /repo' }, '/proj')).toBe(
      contextKey({ command: 'cd /repo' }, '/proj'),
    );
  });
});
