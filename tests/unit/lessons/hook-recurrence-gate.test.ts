import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contextKey } from '../../../src/lessons/context-key.js';
import { graphFilePath } from '../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { recordFailure } from '../../../src/lessons/outcome-log.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';

const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;

const GRAPH: LessonsGraph = {
  version: 2,
  topics: { t: { summary: 't' } },
  triggers: { 'glob-src': { kind: 'file_glob', pattern: 'src/**' } },
  lessons: {
    l1: {
      rule: 'edit src carefully',
      topics: ['t'],
      triggers: ['glob-src'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
  },
};

let root: string;
let prevTel: string | undefined;
let prevSession: string | undefined;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-hook-rg-'));
  const p = graphFilePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(GRAPH), 'utf8');
  prevTel = process.env.AGENTSMESH_LESSONS_TELEMETRY;
  process.env.AGENTSMESH_LESSONS_TELEMETRY = '1';
  prevSession = process.env.AGENTSMESH_SESSION_ID;
  delete process.env.AGENTSMESH_SESSION_ID;
});
afterEach(() => {
  if (prevTel === undefined) delete process.env.AGENTSMESH_LESSONS_TELEMETRY;
  else process.env.AGENTSMESH_LESSONS_TELEMETRY = prevTel;
  if (prevSession !== undefined) process.env.AGENTSMESH_SESSION_ID = prevSession;
  rmSync(root, { recursive: true, force: true });
});

const stdin = (event: string, sessionId: string): string =>
  JSON.stringify({
    hook_event_name: event,
    session_id: sessionId,
    tool_input: { file_path: 'src/x.ts' },
  });

const contextOf = (output: string): string => {
  const parsed = JSON.parse(output) as {
    hookSpecificOutput: { additionalContext: string };
  };
  return parsed.hookSpecificOutput.additionalContext;
};

const seedRecurringFailure = (): void => {
  const key = contextKey({ file: 'src/x.ts' }, root);
  recordFailure(root, key, 'same error', ON);
  recordFailure(root, key, 'same error', ON);
};

describe('hook wiring: recurrence gate on PreToolUse', () => {
  it('injects the covering rule exactly once — the escalation replaces, not duplicates, the recall body', async () => {
    seedRecurringFailure();
    const out = await buildRecallHookOutput(stdin('PreToolUse', 'hs-rg1'), root);
    const ctx = contextOf(out.output);
    expect(ctx).toContain('failed 2×');
    // The escalation preface IS this rule's delivery, so the recall body must not
    // re-inject the identical rule: it appears exactly once in the whole context.
    expect(ctx.split('edit src carefully').length - 1).toBe(1);
    // It was the only matching lesson, so the body collapses to just the escalation.
    expect(ctx).not.toContain('Recalled agentsmesh lessons');
  });

  it('shows overflow covering rules in the recall body without duplicating the escalated ones', async () => {
    // Three lessons cover src/**; the escalation caps at two, so the third must
    // surface in the recall body — and none of the three may appear twice.
    const wide: LessonsGraph = {
      ...GRAPH,
      triggers: { 'glob-src': { kind: 'file_glob', pattern: 'src/**' } },
      lessons: {
        l1: {
          rule: 'guard one',
          topics: ['t'],
          triggers: ['glob-src'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
        l2: {
          rule: 'guard two',
          topics: ['t'],
          triggers: ['glob-src'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
        l3: {
          rule: 'guard three',
          topics: ['t'],
          triggers: ['glob-src'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
      },
    };
    writeFileSync(graphFilePath(root), JSON.stringify(wide), 'utf8');
    seedRecurringFailure();
    const out = await buildRecallHookOutput(stdin('PreToolUse', 'hs-rg6'), root);
    const ctx = contextOf(out.output);
    expect(ctx).toContain('failed 2×');
    expect(ctx).toContain('Recalled agentsmesh lessons for src/x.ts');
    for (const rule of ['guard one', 'guard two', 'guard three']) {
      expect(ctx.split(rule).length - 1).toBe(1);
    }
  });

  it('still escalates when recall is fully session-deduped (covering rule already seen)', async () => {
    seedRecurringFailure();
    // First touch delivers l1 and marks it seen for this session.
    const first = await buildRecallHookOutput(stdin('PostToolUse', 'hs-rg2'), root);
    expect(first.output).not.toBe('');
    // Second touch: recall dedups to nothing, but the escalation must still fire.
    const second = await buildRecallHookOutput(stdin('PreToolUse', 'hs-rg2'), root);
    const ctx = contextOf(second.output);
    expect(ctx).toContain('failed 2×');
    expect(ctx).toContain('edit src carefully');
  });

  it('does not escalate on PostToolUse even with recurring covered failures', async () => {
    seedRecurringFailure();
    const out = await buildRecallHookOutput(stdin('PostToolUse', 'hs-rg3'), root);
    const ctx = contextOf(out.output);
    expect(ctx).not.toContain('failed 2×');
    expect(ctx).toContain('edit src carefully');
  });

  it('injects the plain recall only when the action has no failure history', async () => {
    const out = await buildRecallHookOutput(stdin('PreToolUse', 'hs-rg4'), root);
    const ctx = contextOf(out.output);
    expect(ctx).not.toContain('failed');
    expect(ctx).toContain('edit src carefully');
  });

  it('escalates for a recurring covered command action (raw command, normalized key)', async () => {
    const cmdGraph: LessonsGraph = {
      ...GRAPH,
      triggers: { 'cmd-commit': { kind: 'command_pattern', pattern: 'git commit -m' } },
      lessons: {
        l2: {
          rule: 'commit with care',
          topics: ['t'],
          triggers: ['cmd-commit'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
      },
    };
    writeFileSync(graphFilePath(root), JSON.stringify(cmdGraph), 'utf8');
    const raw = 'git commit -m "wip"';
    const key = contextKey({ command: raw }, root);
    recordFailure(root, key, 'same error', ON);
    recordFailure(root, key, 'same error', ON);
    const out = await buildRecallHookOutput(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'hs-rg5',
        tool_input: { command: raw },
      }),
      root,
    );
    const ctx = contextOf(out.output);
    expect(ctx).toContain('failed 2×');
    expect(ctx).toContain('commit with care');
  });
});
