import { describe, it, expect } from 'vitest';
import { assertKnownFlags, unknownFlagMessage } from '../../../src/cli/flag-validation.js';
import { CliUsageError } from '../../../src/cli/cli-error.js';
import { COMMANDS } from '../../../src/cli/help-data.js';

const GLOBALS = ['help', 'version', 'verbose', 'json'];

/** Flags each handler reads today (audited from src/cli/commands and src/install). */
const HANDLER_FLAGS: Record<string, string[]> = {
  init: ['yes', 'global', 'lessons', 'targets', 'all-targets'],
  generate: ['global', 'targets', 'check', 'dry-run', 'force', 'refresh-cache', 'no-cache'],
  import: ['from', 'global'],
  convert: ['from', 'to', 'global', 'dry-run'],
  install: [
    'sync',
    'path',
    'target',
    'as',
    'name',
    'extends',
    'dry-run',
    'global',
    'all',
    'force',
    'accept-hooks',
    'accept-permissions',
    'accept-mcp',
    'accept-elevated',
  ],
  installs: ['global'],
  uninstall: ['all', 'keep-pack', 'keep-generated', 'global', 'dry-run', 'force'],
  refresh: ['dry-run', 'force', 'global'],
  diff: ['global', 'targets'],
  lint: ['global', 'targets'],
  watch: ['global', 'targets', 'force', 'dry-run', 'check', 'refresh-cache', 'no-cache'],
  check: ['global', 'no-outputs'],
  merge: ['global'],
  matrix: ['global', 'targets', 'verbose'],
  target: ['name', 'force'],
  plugin: ['version', 'id'],
};

function flagBag(names: string[]): Record<string, true> {
  return Object.fromEntries(names.map((name) => [name, true as const]));
}

describe('unknownFlagMessage', () => {
  it('names the flag and suggests the close match', () => {
    expect(unknownFlagMessage('generate', flagBag(['dryrun']))).toBe(
      'Unknown flag --dryrun for `generate`. Did you mean --dry-run?',
    );
  });

  it('suggests the plural when a flag name is missing its end', () => {
    expect(unknownFlagMessage('generate', flagBag(['target']))).toBe(
      'Unknown flag --target for `generate`. Did you mean --targets?',
    );
  });

  it('suggests across case and dash differences', () => {
    expect(unknownFlagMessage('generate', flagBag(['dryRun']))).toBe(
      'Unknown flag --dryRun for `generate`. Did you mean --dry-run?',
    );
    expect(unknownFlagMessage('generate', flagBag(['refreshcache']))).toBe(
      'Unknown flag --refreshcache for `generate`. Did you mean --refresh-cache?',
    );
  });

  it('suggests a flag from the command own list, not a global one that is farther', () => {
    expect(unknownFlagMessage('check', flagBag(['no-output']))).toBe(
      'Unknown flag --no-output for `check`. Did you mean --no-outputs?',
    );
  });

  it('points to --help when nothing is close', () => {
    expect(unknownFlagMessage('generate', flagBag(['zzzzzz']))).toBe(
      'Unknown flag --zzzzzz for `generate`. Run `agentsmesh generate --help` to see the accepted flags.',
    );
  });

  it('does not suggest a flag of another command', () => {
    expect(unknownFlagMessage('merge', flagBag(['from']))).toBe(
      'Unknown flag --from for `merge`. Run `agentsmesh merge --help` to see the accepted flags.',
    );
  });

  it('reports the first unknown flag in the order given', () => {
    expect(unknownFlagMessage('generate', { global: true, bogus: 'x', dryrun: true })).toBe(
      'Unknown flag --bogus for `generate`. Run `agentsmesh generate --help` to see the accepted flags.',
    );
  });

  it('rejects a bare -- marker as an unknown flag', () => {
    expect(unknownFlagMessage('install', { '': 'pack' })).toBe(
      'Unknown flag -- for `install`. Run `agentsmesh install --help` to see the accepted flags.',
    );
  });

  it('returns undefined when every flag is accepted', () => {
    expect(unknownFlagMessage('generate', { 'dry-run': true, targets: 'cursor' })).toBeUndefined();
    expect(unknownFlagMessage('generate', {})).toBeUndefined();
  });

  it('accepts the global flags on every validated command', () => {
    for (const command of Object.keys(HANDLER_FLAGS)) {
      expect(unknownFlagMessage(command, flagBag(GLOBALS)), command).toBeUndefined();
    }
  });

  it('accepts every flag a handler reads', () => {
    for (const [command, names] of Object.entries(HANDLER_FLAGS)) {
      expect(unknownFlagMessage(command, flagBag(names)), command).toBeUndefined();
    }
  });

  it('accepts every flag the help table lists for the command', () => {
    for (const command of COMMANDS) {
      if (command.name === 'lessons' || command.name === 'mcp') continue;
      const names = command.flags
        .flatMap((flag) => flag.name.split(/\s+/))
        .filter((token) => token.startsWith('--'))
        .map((token) => token.slice(2));
      expect(unknownFlagMessage(command.name, flagBag(names)), command.name).toBeUndefined();
    }
  });

  it('lets generate --features reach its own "no longer supported" error', () => {
    expect(unknownFlagMessage('generate', { features: 'rules' })).toBeUndefined();
    expect(unknownFlagMessage('check', { features: 'rules' })).toBe(
      'Unknown flag --features for `check`. Run `agentsmesh check --help` to see the accepted flags.',
    );
  });

  it('leaves lessons, mcp and commands outside the help table alone', () => {
    expect(unknownFlagMessage('lessons', { anything: true })).toBeUndefined();
    expect(unknownFlagMessage('mcp', { anything: true })).toBeUndefined();
    expect(unknownFlagMessage('probe', { anything: true })).toBeUndefined();
  });

  it('rejects flags that are not documented for the command, even if another command reads them', () => {
    expect(unknownFlagMessage('merge', flagBag(['dry-run']))).toBe(
      'Unknown flag --dry-run for `merge`. Run `agentsmesh merge --help` to see the accepted flags.',
    );
    expect(unknownFlagMessage('generate', flagBag(['no-matrix']))).toBe(
      'Unknown flag --no-matrix for `generate`. Run `agentsmesh generate --help` to see the accepted flags.',
    );
  });
});

describe('assertKnownFlags', () => {
  it('throws a CliUsageError (exit code 2) with the message', () => {
    expect(() => assertKnownFlags('generate', { dryrun: true })).toThrow(CliUsageError);
    expect(() => assertKnownFlags('generate', { dryrun: true })).toThrow(
      'Unknown flag --dryrun for `generate`. Did you mean --dry-run?',
    );
  });

  it('does nothing when the flags are fine', () => {
    expect(() => assertKnownFlags('generate', { 'dry-run': true })).not.toThrow();
  });

  it('accepts repeated flag values (array form)', () => {
    expect(() =>
      assertKnownFlags('generate', { targets: ['cursor', 'claude-code'] }),
    ).not.toThrow();
  });
});
