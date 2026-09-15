/**
 * Recall caps what it injects. `lessons query` already reports a hidden match
 * on stderr, but the hook — the only surface an agent reads mid-session — said
 * nothing, so a budget too small for the graph was invisible from inside a run.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitRecall } from '../../../src/lessons/hook-emit.js';

let project: string;

function writeGraph(count: number): void {
  const lessons: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    lessons[`l-${i}`] = {
      createdAt: '2026-09-15',
      evidence: ['probe'],
      rule: `Rule number ${i} about the same file.`,
      status: 'active',
      topics: ['general'],
      triggers: ['t-glob-a'],
    };
  }
  writeFileSync(
    join(project, '.agentsmesh/lessons/lessons.json'),
    JSON.stringify({
      version: 2,
      lessons,
      topics: { general: { summary: 'General' } },
      triggers: { 't-glob-a': { kind: 'file_glob', pattern: 'src/app.ts' } },
    }),
  );
}

function additionalContext(output: string): string {
  if (output === '') return '';
  const parsed = JSON.parse(output) as {
    hookSpecificOutput: { additionalContext: string };
  };
  return parsed.hookSpecificOutput.additionalContext;
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'am-hook-trunc-'));
  mkdirSync(join(project, '.agentsmesh/lessons'), { recursive: true });
});
afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe('recall hook truncation notice', () => {
  it('says how many matches did not fit, and names the knob', async () => {
    writeGraph(8);

    const { output } = await emitRecall(
      project,
      { file: 'src/app.ts' },
      { event: 'PreToolUse', lead: 'Recalled lessons', sessionId: undefined },
    );
    const context = additionalContext(output);

    expect(context).toContain('3 more matched');
    expect(context).toContain('recallMaxTokens');
  });

  it('stays quiet when every match was delivered', async () => {
    writeGraph(2);

    const { output } = await emitRecall(
      project,
      { file: 'src/app.ts' },
      { event: 'PreToolUse', lead: 'Recalled lessons', sessionId: undefined },
    );
    const context = additionalContext(output);

    expect(context).toContain('Rule number 0');
    expect(context).not.toContain('more matched');
  });

  it('does not count lessons held back by session dedup as hidden by the cap', async () => {
    writeGraph(4);
    const session = 'session-dedup-probe';
    const first = await emitRecall(
      project,
      { file: 'src/app.ts' },
      { event: 'PreToolUse', lead: 'Recalled lessons', sessionId: session },
    );
    expect(additionalContext(first.output)).not.toContain('more matched');

    // Second call: all four are already shown, so recall is silent — that is
    // dedup working, not a budget that is too small.
    const second = await emitRecall(
      project,
      { file: 'src/app.ts' },
      { event: 'PreToolUse', lead: 'Recalled lessons', sessionId: session },
    );

    expect(additionalContext(second.output)).not.toContain('more matched');
  });
});
