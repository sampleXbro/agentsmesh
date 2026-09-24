import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doMergeDriver } from '../../../src/cli/commands/lessons-merge-driver-handler.js';

let dir: string;
const p = (name: string): string => join(dir, name);

function graph(lessons: Record<string, unknown>, triggers: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    lessons,
    topics: { general: { summary: 'General' } },
    triggers: { 't-glob-a': { kind: 'file_glob', pattern: 'src/a.ts' }, ...triggers },
  });
}

const lesson = (rule: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  createdAt: '2026-09-13',
  evidence: ['probe'],
  rule,
  status: 'active',
  topics: ['general'],
  triggers: ['t-glob-a'],
  ...extra,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-merge-driver-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('lessons merge driver', () => {
  it('unions both sides when git supplies an empty base file', () => {
    writeFileSync(p('base'), '');
    writeFileSync(p('ours'), graph({ 'l-a': lesson('rule a') }));
    writeFileSync(p('theirs'), graph({ 'l-b': lesson('rule b') }));

    const result = doMergeDriver([p('base'), p('ours'), p('theirs')]);

    expect(result.exitCode).toBe(0);
    const merged = readFileSync(p('ours'), 'utf8');
    expect(merged).toContain('rule a');
    expect(merged).toContain('rule b');
  });

  it('merges cleanly when the base already carries a validation error', () => {
    const badTrigger = { 't-cmd-bad': { kind: 'command_pattern', pattern: 'git(?=\\s)' } };
    const withBad = (rule: string): Record<string, unknown> => ({
      'l-bad': lesson('pre-existing', { triggers: ['t-cmd-bad'] }),
      [`l-${rule}`]: lesson(rule),
    });
    writeFileSync(p('base'), graph(withBad('base'), badTrigger));
    writeFileSync(p('ours'), graph(withBad('ours'), badTrigger));
    writeFileSync(p('theirs'), graph(withBad('theirs'), badTrigger));

    const result = doMergeDriver([p('base'), p('ours'), p('theirs')]);

    expect(result.exitCode).toBe(0);
    const merged = readFileSync(p('ours'), 'utf8');
    expect(merged).toContain('ours');
    expect(merged).toContain('theirs');
  });

  it('keeps the other branch lessons in the file even when it cannot exit clean', () => {
    writeFileSync(p('base'), graph({}));
    writeFileSync(p('ours'), graph({ 'l-a': lesson('rule a') }));
    writeFileSync(p('theirs'), 'not json at all');

    const result = doMergeDriver([p('base'), p('ours'), p('theirs')]);

    expect(result.exitCode).toBe(1);
    const written = readFileSync(p('ours'), 'utf8');
    expect(written).toContain('rule a');
    expect(written).toContain('not json at all');
    expect(written).toMatch(/^<{7} /m);
    expect(result.error).toContain('conflict markers');
  });

  it('never silently discards theirs when ours wins a tie', () => {
    writeFileSync(p('base'), graph({ 'l-a': lesson('shared') }));
    writeFileSync(p('ours'), graph({ 'l-a': lesson('shared'), 'l-o': lesson('only ours') }));
    writeFileSync(p('theirs'), graph({ 'l-a': lesson('shared'), 'l-t': lesson('only theirs') }));

    expect(doMergeDriver([p('base'), p('ours'), p('theirs')]).exitCode).toBe(0);

    const merged = readFileSync(p('ours'), 'utf8');
    expect(merged).toContain('only ours');
    expect(merged).toContain('only theirs');
  });
});
