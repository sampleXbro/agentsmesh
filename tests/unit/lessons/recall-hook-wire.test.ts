/**
 * `wireRecallHook` reports what happened to the recall hook (created, wired,
 * current or skipped with a reason) and can seed a missing hooks.yaml, so a
 * retrofit never looks the same as "already current".
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { injectRecallHook, wireRecallHook } from '../../../src/lessons/recall-hook-scaffold.js';

const BARE = 'agentsmesh lessons hook';
const MATCHER = 'Edit|Write|NotebookEdit|Bash|PowerShell';
const EVENTS = ['PreToolUse', 'UserPromptSubmit', 'PostToolUseFailure', 'SessionStart'] as const;
const TEMPLATE = [
  '# yaml-language-server: $schema=https://example.test/hooks.json',
  '# Lifecycle hooks — example',
  '#',
  '# PreToolUse:',
  '#   - matcher: Edit|Write',
  '#     type: command',
  '#     command: npm run lint',
  '',
].join('\n');

let root: string;
const hooksPath = (): string => join(root, '.agentsmesh', 'hooks.yaml');
const parsed = (): Record<string, Array<{ matcher?: string; command?: string }>> =>
  parseYaml(readFileSync(hooksPath(), 'utf8')) as never;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recallhook-wire-'));
  mkdirSync(join(root, '.agentsmesh'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('wireRecallHook — missing hooks.yaml', () => {
  it('skips with a reason and writes nothing when no template is given', () => {
    expect(wireRecallHook(root)).toEqual({
      status: 'skipped',
      reason: 'there is no .agentsmesh/hooks.yaml to wire it into',
    });
    expect(existsSync(hooksPath())).toBe(false);
  });

  it('creates the file from the template, keeping its schema directive and comments', () => {
    expect(wireRecallHook(root, TEMPLATE)).toEqual({ status: 'created' });
    const text = readFileSync(hooksPath(), 'utf8');
    expect(
      text.startsWith('# yaml-language-server: $schema=https://example.test/hooks.json\n'),
    ).toBe(true);
    expect(text).toContain('# Lifecycle hooks — example');
    expect(Object.keys(parsed()).sort()).toEqual([...EVENTS].sort());
    for (const event of EVENTS) expect(parsed()[event]!.map((h) => h.command)).toEqual([BARE]);
    expect(parsed().PreToolUse![0]!.matcher).toBe(MATCHER);
  });

  it('is current on the second run and does not touch the file again', () => {
    wireRecallHook(root, TEMPLATE);
    const first = readFileSync(hooksPath(), 'utf8');
    expect(wireRecallHook(root, TEMPLATE)).toEqual({ status: 'current' });
    expect(readFileSync(hooksPath(), 'utf8')).toBe(first);
  });

  it('creates the .agentsmesh folder when it is missing too', () => {
    rmSync(join(root, '.agentsmesh'), { recursive: true });
    expect(wireRecallHook(root, TEMPLATE)).toEqual({ status: 'created' });
    expect(existsSync(hooksPath())).toBe(true);
  });
});

describe('wireRecallHook — existing hooks.yaml', () => {
  it('reports wired when it added entries to a file without them', () => {
    writeFileSync(hooksPath(), '# hooks\n', 'utf8');
    expect(wireRecallHook(root, TEMPLATE)).toEqual({ status: 'wired' });
    expect(readFileSync(hooksPath(), 'utf8')).not.toContain('example.test');
  });

  it('reports current when every managed entry is already there', () => {
    writeFileSync(hooksPath(), '# hooks\n', 'utf8');
    wireRecallHook(root);
    const first = readFileSync(hooksPath(), 'utf8');
    expect(wireRecallHook(root)).toEqual({ status: 'current' });
    expect(readFileSync(hooksPath(), 'utf8')).toBe(first);
  });

  it('skips and leaves the file alone when the YAML is invalid', () => {
    const broken = 'PreToolUse:\n  - matcher: [unclosed\n';
    writeFileSync(hooksPath(), broken, 'utf8');
    expect(wireRecallHook(root)).toEqual({
      status: 'skipped',
      reason: '.agentsmesh/hooks.yaml is not valid YAML',
    });
    expect(readFileSync(hooksPath(), 'utf8')).toBe(broken);
  });

  it('skips and leaves the file alone when the top level is not a map', () => {
    writeFileSync(hooksPath(), '- just\n- a list\n', 'utf8');
    expect(wireRecallHook(root)).toEqual({
      status: 'skipped',
      reason: '.agentsmesh/hooks.yaml does not hold a map of events',
    });
    expect(readFileSync(hooksPath(), 'utf8')).toBe('- just\n- a list\n');
  });
});

describe('injectRecallHook — compatibility wrapper', () => {
  it('stays false and creates nothing for a missing file', () => {
    expect(injectRecallHook(root)).toBe(false);
    expect(existsSync(hooksPath())).toBe(false);
  });

  it('is true when it wired and false when it was already current', () => {
    writeFileSync(hooksPath(), '', 'utf8');
    expect(injectRecallHook(root)).toBe(true);
    expect(injectRecallHook(root)).toBe(false);
  });
});
