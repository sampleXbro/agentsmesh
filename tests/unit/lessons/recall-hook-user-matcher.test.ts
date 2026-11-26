/**
 * A re-run of `init --lessons` must not undo what the user chose in hooks.yaml.
 * It keeps a matcher the user narrowed, still updates a drifted command, and
 * still upgrades the one matcher an older scaffold wrote as its default.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { injectRecallHook } from '../../../src/lessons/recall-hook-scaffold.js';

const BARE = 'agentsmesh lessons hook';
const NPX = 'npx --no --offline agentsmesh lessons hook';
const DEFAULT_MATCHER = 'Edit|Write|NotebookEdit|Bash|PowerShell';

let root: string;
const hooksPath = (): string => join(root, '.agentsmesh', 'hooks.yaml');
type Entry = { matcher?: string; type?: string; command?: string; timeout?: number };
const parsed = (): Record<string, Entry[]> =>
  parseYaml(readFileSync(hooksPath(), 'utf8')) as Record<string, Entry[]>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recallhook-matcher-'));
  mkdirSync(join(root, '.agentsmesh'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function narrowedPreToolUse(command: string): string {
  return [
    '# yaml-language-server: $schema=./schema.json',
    '# team hooks',
    'PreToolUse:',
    '  - matcher: Edit|Write # only file edits',
    '    type: command',
    `    command: ${command}`,
    '',
  ].join('\n');
}

describe('injectRecallHook — user-chosen matcher', () => {
  it('keeps a narrowed matcher on re-run and keeps the comments', () => {
    writeFileSync(hooksPath(), narrowedPreToolUse(BARE), 'utf8');
    expect(injectRecallHook(root)).toBe(true);
    expect(parsed().PreToolUse).toEqual([
      { matcher: 'Edit|Write', type: 'command', command: BARE },
    ]);
    expect(readFileSync(hooksPath(), 'utf8')).toContain('# only file edits');
    const settled = readFileSync(hooksPath(), 'utf8');
    expect(injectRecallHook(root)).toBe(false);
    expect(readFileSync(hooksPath(), 'utf8')).toBe(settled);
  });

  it('still updates the command of an entry whose matcher the user narrowed', () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ devDependencies: { agentsmesh: '1' } }),
    );
    writeFileSync(hooksPath(), narrowedPreToolUse(BARE), 'utf8');
    expect(injectRecallHook(root)).toBe(true);
    expect(parsed().PreToolUse).toEqual([{ matcher: 'Edit|Write', type: 'command', command: NPX }]);
  });

  it('keeps a user matcher that is wider than the default', () => {
    writeFileSync(
      hooksPath(),
      `PreToolUse:\n  - matcher: "*"\n    type: command\n    command: ${BARE}\n`,
      'utf8',
    );
    injectRecallHook(root);
    expect(parsed().PreToolUse![0]!.matcher).toBe('*');
  });

  it('keeps the user matcher on every event, not only PreToolUse', () => {
    writeFileSync(
      hooksPath(),
      `SessionStart:\n  - matcher: startup\n    type: command\n    command: ${BARE}\n`,
      'utf8',
    );
    injectRecallHook(root);
    expect(parsed().SessionStart).toEqual([{ matcher: 'startup', type: 'command', command: BARE }]);
  });

  it('upgrades the matcher an older scaffold wrote as its default', () => {
    writeFileSync(
      hooksPath(),
      `PreToolUse:\n  - matcher: Edit|Write|Bash\n    type: command\n    command: ${BARE}\n`,
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    expect(parsed().PreToolUse![0]!.matcher).toBe(DEFAULT_MATCHER);
  });
});

describe('injectRecallHook — deleted entries', () => {
  it('restores a managed entry the user deleted, because init is an explicit request', () => {
    writeFileSync(hooksPath(), '# hooks\n', 'utf8');
    injectRecallHook(root);
    const text = readFileSync(hooksPath(), 'utf8');
    const without = text.replace(/UserPromptSubmit:\n(?: {2}.*\n|- .*\n)+/, '');
    expect(without).not.toContain('UserPromptSubmit');
    writeFileSync(hooksPath(), without, 'utf8');
    expect(injectRecallHook(root)).toBe(true);
    expect(parsed().UserPromptSubmit).toEqual([{ matcher: '*', type: 'command', command: BARE }]);
    expect(Object.keys(parsed()).sort()).toEqual([
      'PostToolUseFailure',
      'PreToolUse',
      'SessionStart',
      'UserPromptSubmit',
    ]);
  });
});
