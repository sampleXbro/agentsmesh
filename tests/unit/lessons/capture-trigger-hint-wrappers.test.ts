/**
 * The failure nudge pastes a `--trigger-cmd` hint built from the failed command.
 * A hint keyed on a flag, a wrapper (`sudo`, `env`) or a token from inside
 * `$( )` fires on unrelated commands (`-d\b` fires on `docker compose up -d`),
 * so the hint names the program that really runs, or stays a placeholder.
 */

import { describe, expect, it } from 'vitest';
import { triggerHint } from '../../../src/lessons/capture-trigger-hint.js';
import { getCommandMatcher } from '../../../src/lessons/regex-safety.js';

const CMD_PLACEHOLDER = "--trigger-cmd '<regex matching the command>'";
const BUDGET = 100_000;

function patternOf(hint: string): string {
  const match = /^--trigger-cmd '(.*)'$/.exec(hint);
  if (match === null) throw new Error(`not a command hint: ${hint}`);
  return match[1]!;
}

function fires(pattern: string, command: string): boolean {
  return getCommandMatcher(pattern)?.test(command, { remaining: BUDGET }) === true;
}

describe('triggerHint — the program that really runs', () => {
  it.each([
    [
      'SB=$(mktemp -d /tmp/x.XXXX) && mkdir -p "$SB/home" && cd "$SB" && git init -q',
      '\\bmkdir\\b',
    ],
    ['sudo -u www npm ci', '\\bnpm ci\\b'],
    ['env NODE_ENV=test node scripts/run.js', '\\bnode\\b'],
    ['time make -j8 build', '\\bmake\\b.*\\bbuild\\b'],
    ['FOO=1 pnpm test', '\\bpnpm test\\b'],
    ['V=$(git rev-parse HEAD | head -c 7) pnpm test', '\\bpnpm test\\b'],
    ['FOO="a b" pnpm test', '\\bpnpm test\\b'],
    ['nice -n 10 pnpm build', '\\bpnpm build\\b'],
    ['nohup node server.js &', '\\bnode\\b'],
    ['sudo env FOO=1 nice -n5 npm ci', '\\bnpm ci\\b'],
    ['command -v git', '\\bcommand\\b'],
  ])('%s → %s', (command, pattern) => {
    expect(triggerHint({ command })).toBe(`--trigger-cmd '${pattern}'`);
  });

  it.each([
    'SB=$(mktemp -d /tmp/x.XXXX) && mkdir -p "$SB/home" && cd "$SB" && git init -q',
    'sudo -u www npm ci',
    'env NODE_ENV=test node scripts/run.js',
    'time make -j8 build',
    'FOO=1 pnpm test',
    'V=$(git rev-parse HEAD | head -c 7) pnpm test',
    'nohup node server.js &',
  ])('the hint for %s fires on the command that failed', (command) => {
    expect(fires(patternOf(triggerHint({ command })), command)).toBe(true);
  });

  it('no longer suggests a flag that fires on unrelated commands', () => {
    const failed = 'SB=$(mktemp -d /tmp/x.XXXX) && mkdir -p "$SB/home" && cd "$SB" && git init -q';
    const pattern = patternOf(triggerHint({ command: failed }));
    expect(fires(pattern, 'docker compose up -d')).toBe(false);
    expect(fires(pattern, 'date -d yesterday')).toBe(false);
  });

  it('no longer suggests a wrapper that fires on every elevated command', () => {
    const pattern = patternOf(triggerHint({ command: 'sudo -u www npm ci' }));
    expect(fires(pattern, 'sudo systemctl restart nginx')).toBe(false);
  });
});

describe('triggerHint — placeholder when nothing reliable is left', () => {
  it.each([
    'SB=$(mktemp -d /tmp/x.XXXX)',
    'V=$(git rev-parse HEAD | head -c 7)',
    'FOO="a b"',
    'FOO=bar',
    'sudo',
    'sudo -l',
    'env',
    'env FOO=1',
    '-d foo',
    '$CMD run',
    '$(which node) x.js',
    '',
  ])('%j', (command) => {
    expect(triggerHint({ command })).toBe(CMD_PLACEHOLDER);
  });
});
