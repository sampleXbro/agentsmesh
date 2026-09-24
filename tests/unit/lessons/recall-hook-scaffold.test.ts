import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  injectRecallHook,
  RECALL_HOOK_COMMAND,
} from '../../../src/lessons/recall-hook-scaffold.js';

let root: string;
const hooksPath = (): string => join(root, '.agentsmesh', 'hooks.yaml');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recallhook-'));
  mkdirSync(join(root, '.agentsmesh'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

type Ev = 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'PostToolUseFailure' | 'SessionStart';
function eventEntries(event: Ev): Array<{ command?: string; matcher?: string }> {
  const parsed = parseYaml(readFileSync(hooksPath(), 'utf8')) as Record<
    string,
    Array<{ command?: string; matcher?: string }> | undefined
  >;
  return parsed[event] ?? [];
}
function eventCommands(event: Ev): string[] {
  return eventEntries(event).map((h) => h.command ?? '');
}

describe('injectRecallHook', () => {
  it('adds PreToolUse + UserPromptSubmit recall hooks (never PostToolUse), preserving directive + comments', () => {
    writeFileSync(
      hooksPath(),
      '# yaml-language-server: $schema=./schema.json\n# Lifecycle hooks — example\n',
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    const text = readFileSync(hooksPath(), 'utf8');
    expect(text).toContain('# yaml-language-server: $schema=./schema.json');
    expect(text).toContain('# Lifecycle hooks — example');
    expect(eventCommands('PreToolUse')).toContain(RECALL_HOOK_COMMAND);
    // PreToolUse fires before EVERY tool call, so a PostToolUse recall for the same
    // action only re-ran recall after the fact — a second process and a second
    // context block per tool call, with advice that arrived too late to apply.
    expect(eventCommands('PostToolUse')).not.toContain(RECALL_HOOK_COMMAND);
    // UserPromptSubmit carries the task text — the only event that can recall
    // keyword/conceptual lessons against task intent. It has no tool matcher.
    expect(eventCommands('UserPromptSubmit')).toContain(RECALL_HOOK_COMMAND);
    const prompt = eventEntries('UserPromptSubmit').find((h) => h.command === RECALL_HOOK_COMMAND);
    expect(prompt?.matcher).toBe('*');
    // Claude Code compares a pipe list by exact tool name, so notebook edits and
    // PowerShell commands need their own names to recall.
    const pre = eventEntries('PreToolUse').find((h) => h.command === RECALL_HOOK_COMMAND);
    expect(pre?.matcher).toBe('Edit|Write|NotebookEdit|Bash|PowerShell');
    // PostToolUseFailure carries the capture-on-failure nudge (best-effort; Claude only).
    expect(eventCommands('PostToolUseFailure')).toContain(RECALL_HOOK_COMMAND);
    // SessionStart resets recall dedup after a context compaction (best-effort).
    expect(eventCommands('SessionStart')).toContain(RECALL_HOOK_COMMAND);
  });

  it('is idempotent by command — a second run adds nothing and changes nothing', () => {
    writeFileSync(hooksPath(), '# yaml-language-server: $schema=./schema.json\n', 'utf8');
    expect(injectRecallHook(root)).toBe(true);
    const after1 = readFileSync(hooksPath(), 'utf8');
    expect(injectRecallHook(root)).toBe(false);
    expect(readFileSync(hooksPath(), 'utf8')).toBe(after1);
    expect(eventCommands('PreToolUse').filter((c) => c === RECALL_HOOK_COMMAND)).toHaveLength(1);
    expect(eventCommands('UserPromptSubmit').filter((c) => c === RECALL_HOOK_COMMAND)).toHaveLength(
      1,
    );
    expect(
      eventCommands('PostToolUseFailure').filter((c) => c === RECALL_HOOK_COMMAND),
    ).toHaveLength(1);
    expect(eventCommands('SessionStart').filter((c) => c === RECALL_HOOK_COMMAND)).toHaveLength(1);
  });

  it('preserves an existing user PostToolUse hook and appends the recall one to each event', () => {
    writeFileSync(
      hooksPath(),
      'PostToolUse:\n  - matcher: Edit\n    type: command\n    command: npm run lint\n',
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    expect(eventCommands('PostToolUse')).toEqual(['npm run lint']);
    expect(eventCommands('PreToolUse')).toEqual([RECALL_HOOK_COMMAND]);
    expect(eventCommands('UserPromptSubmit')).toEqual([RECALL_HOOK_COMMAND]);
    expect(eventCommands('PostToolUseFailure')).toEqual([RECALL_HOOK_COMMAND]);
    expect(eventCommands('SessionStart')).toEqual([RECALL_HOOK_COMMAND]);
  });

  it("removes a previously scaffolded PostToolUse recall entry but keeps the user's own hooks there", () => {
    writeFileSync(
      hooksPath(),
      [
        'PreToolUse:',
        '  - matcher: Edit|Write|Bash',
        '    type: command',
        `    command: ${RECALL_HOOK_COMMAND}`,
        'PostToolUse:',
        '  - matcher: Edit',
        '    type: command',
        '    command: npm run lint',
        '  - matcher: Edit|Write|Bash',
        '    type: command',
        `    command: ${RECALL_HOOK_COMMAND}`,
        'UserPromptSubmit:',
        '  - matcher: "*"',
        '    type: command',
        `    command: ${RECALL_HOOK_COMMAND}`,
        'PostToolUseFailure:',
        '  - matcher: "*"',
        '    type: command',
        `    command: ${RECALL_HOOK_COMMAND}`,
        'SessionStart:',
        '  - matcher: "*"',
        '    type: command',
        `    command: ${RECALL_HOOK_COMMAND}`,
        '',
      ].join('\n'),
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    expect(eventCommands('PostToolUse')).toEqual(['npm run lint']);
    expect(eventCommands('PreToolUse')).toEqual([RECALL_HOOK_COMMAND]);
    expect(injectRecallHook(root)).toBe(false);
  });

  it('drops the PostToolUse key entirely when the recall entry was its only hook', () => {
    writeFileSync(
      hooksPath(),
      `PostToolUse:\n  - matcher: Edit|Write|Bash\n    type: command\n    command: ${RECALL_HOOK_COMMAND}\n`,
      'utf8',
    );
    expect(injectRecallHook(root)).toBe(true);
    // Parsed keys, not raw text: the scaffold also writes PostToolUseFailure.
    const keys = Object.keys(
      parseYaml(readFileSync(hooksPath(), 'utf8')) as Record<string, unknown>,
    );
    expect(keys).not.toContain('PostToolUse');
    expect(keys).toContain('PostToolUseFailure');
    expect(eventCommands('PreToolUse')).toEqual([RECALL_HOOK_COMMAND]);
  });

  it('does not create hooks.yaml when absent — only injects into an existing file', () => {
    rmSync(hooksPath(), { force: true });
    expect(existsSync(hooksPath())).toBe(false);
    expect(injectRecallHook(root)).toBe(false);
    expect(existsSync(hooksPath())).toBe(false);
  });
});
