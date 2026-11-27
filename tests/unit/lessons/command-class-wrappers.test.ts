/**
 * A command class names the program that really runs. Leading `VAR=value`
 * words (the value may hold spaces, quotes or `$(…)`) and wrapper programs
 * (`sudo`, `env`, `time`, `nice`, `nohup`, `command`, `exec`) are not that
 * program, and nothing inside `$( )` or starting with `-` or `$` ever is.
 */

import { describe, expect, it } from 'vitest';
import { commandClass } from '../../../src/lessons/command-class.js';
import { normalizeCommand } from '../../../src/lessons/context-key.js';

describe('commandClass — wrapper programs are skipped', () => {
  it.each([
    ['sudo npm ci', 'npm ci'],
    ['sudo -u www npm ci', 'npm ci'],
    ['sudo -Eu www npm ci', 'npm ci'],
    ['sudo -E -H npm ci', 'npm ci'],
    ['sudo --user www npm ci', 'npm ci'],
    ['sudo --user=www npm ci', 'npm ci'],
    ['sudo -- npm ci', 'npm ci'],
    ['/usr/bin/sudo npm ci', 'npm ci'],
    ['sudo FOO=1 npm ci', 'npm ci'],
    ['env NODE_ENV=test node scripts/run.js', 'node'],
    ['env -u FOO -i node scripts/run.js', 'node'],
    ['env -C /tmp pnpm test', 'pnpm test'],
    ['time pnpm test', 'pnpm test'],
    ['time -p make build', 'make build'],
    ['nice -n 10 pnpm build', 'pnpm build'],
    ['nice -10 pnpm build', 'pnpm build'],
    ['nohup node server.js', 'node'],
    ['command git status', 'git status'],
    ['command -p git status', 'git status'],
    ['exec node app.js', 'node'],
    ['exec -a name node app.js', 'node'],
    ['FOO=1 sudo -u x BAR=2 env Z=3 nice -n5 pnpm test', 'pnpm test'],
    ['cd /repo && sudo -u www npm ci', 'npm ci'],
  ])('%s → %s', (command, expected) => {
    expect(normalizeCommand(command)).toBe(expected);
  });

  it('keeps the gap flag for a subcommand behind global flags', () => {
    expect(commandClass('time make -j8 build')).toEqual({
      program: 'make',
      subcommand: 'build',
      gapped: true,
    });
    expect(commandClass('sudo -u www git -C app commit')).toEqual({
      program: 'git',
      subcommand: 'commit',
      gapped: true,
    });
  });

  it('keeps `command -v` as the program: it only looks a program up', () => {
    expect(commandClass('command -v git')).toEqual({ program: 'command', gapped: false });
    expect(commandClass('command -V git')).toEqual({ program: 'command', gapped: false });
  });

  it('has no class when a wrapper wraps nothing', () => {
    expect(commandClass('sudo')).toBeNull();
    expect(commandClass('sudo -l')).toBeNull();
    expect(commandClass('env')).toBeNull();
    expect(commandClass('env FOO=1')).toBeNull();
    expect(commandClass('nohup')).toBeNull();
  });
});

describe('commandClass — assignment values may hold spaces, quotes and $( )', () => {
  it.each([
    ['FOO="a b" pnpm test', 'pnpm test'],
    ["FOO='a b' pnpm test", 'pnpm test'],
    ['V=$(git rev-parse HEAD | head -c 7) pnpm test', 'pnpm test'],
    ['A=$(echo a) B=$(echo b c) pnpm test', 'pnpm test'],
    ['A=`date -d now` pnpm test', 'pnpm test'],
    ['SB=$(mktemp -d /tmp/x.XXXX) && mkdir -p "$SB/home" && cd "$SB" && git init -q', 'mkdir'],
    ['(SB=$(mktemp -d) pnpm test)', 'pnpm test'],
  ])('%s → %s', (command, expected) => {
    expect(normalizeCommand(command)).toBe(expected);
  });

  it('has no class for a command that only assigns', () => {
    expect(commandClass('SB=$(mktemp -d /tmp/x.XXXX)')).toBeNull();
    expect(commandClass('V=$(git rev-parse HEAD | head -c 7)')).toBeNull();
    expect(commandClass('FOO="a b"')).toBeNull();
  });
});

describe('commandClass — never a fragment from inside $( ) or a flag', () => {
  it('does not split a command on separators inside $( )', () => {
    expect(normalizeCommand('echo $(cat f | head -1) && pnpm test')).toBe('echo');
    expect(normalizeCommand('echo $(a; b) ; pnpm test')).toBe('echo');
    expect(normalizeCommand('echo $(echo $(a && b) || c); pnpm test')).toBe('echo');
    expect(normalizeCommand('echo $((1 + 2)) && pnpm test')).toBe('echo');
  });

  it('keeps splitting on a plain subshell, which is not a substitution', () => {
    expect(normalizeCommand('(cd pkg && make build)')).toBe('make build');
  });

  it.each([
    ['-d foo'],
    ['--flag value'],
    ['$CMD run'],
    ['$HOME/bin/tool run'],
    ['$(which node) x.js'],
    ['"$SB/bin/tool" run'],
  ])('%s has no class', (command) => {
    expect(commandClass(command)).toBeNull();
  });

  it('falls through to the next segment when a segment has no usable program', () => {
    expect(normalizeCommand('-d foo && pnpm test')).toBe('pnpm test');
  });
});
