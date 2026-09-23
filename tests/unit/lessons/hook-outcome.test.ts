import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { graphFilePath } from '../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { readOutcomeLog } from '../../../src/lessons/outcome-log.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';

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
  root = mkdtempSync(join(tmpdir(), 'amesh-hook-outcome-'));
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

describe('hook wiring: outcome emission', () => {
  it('a tool-call recall records a delivered event keyed by the file action', async () => {
    const out = await buildRecallHookOutput(
      JSON.stringify({ hook_event_name: 'PostToolUse', tool_input: { file_path: 'src/x.ts' } }),
      root,
    );
    expect(out.output).not.toBe(''); // the lesson was injected
    const recs = readOutcomeLog(root);
    expect(recs.length).toBe(1);
    expect(recs[0]).toMatchObject({
      kind: 'delivered',
      lessonId: 'l1',
      contextKey: 'file:src/x.ts',
    });
  });

  it('a PostToolUseFailure records a failure event keyed by the same action', async () => {
    await buildRecallHookOutput(
      JSON.stringify({
        hook_event_name: 'PostToolUseFailure',
        tool_input: { file_path: 'src/x.ts' },
      }),
      root,
    );
    expect(readOutcomeLog(root)).toEqual([
      expect.objectContaining({ kind: 'failure', contextKey: 'file:src/x.ts' }),
    ]);
  });

  it('records a failure (not a delivery) from a normally-named event that carries tool_error', async () => {
    // Portable: a harness that reuses PostToolUse and signals failure via `tool_error`
    // is detected as a failure — and does NOT get mis-recorded as a delivery.
    await buildRecallHookOutput(
      JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_input: { file_path: 'src/x.ts' },
        tool_error: 'boom',
      }),
      root,
    );
    expect(readOutcomeLog(root)).toEqual([
      expect.objectContaining({ kind: 'failure', contextKey: 'file:src/x.ts' }),
    ]);
  });

  it('threads the harness session_id into delivered records (env session unset)', async () => {
    await buildRecallHookOutput(
      JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: 'hs1',
        tool_input: { file_path: 'src/x.ts' },
      }),
      root,
    );
    expect(readOutcomeLog(root)).toEqual([
      expect.objectContaining({ kind: 'delivered', lessonId: 'l1', session: 'hs1', rank: 0 }),
    ]);
  });

  it('threads the harness session_id into failure records', async () => {
    await buildRecallHookOutput(
      JSON.stringify({
        hook_event_name: 'PostToolUseFailure',
        session_id: 'hs1',
        tool_input: { file_path: 'src/x.ts' },
      }),
      root,
    );
    expect(readOutcomeLog(root)).toEqual([
      expect.objectContaining({ kind: 'failure', session: 'hs1' }),
    ]);
  });

  it('records nothing when the outcome log is turned off', async () => {
    const prev = process.env.AGENTSMESH_LESSONS_OUTCOME_LOG;
    process.env.AGENTSMESH_LESSONS_OUTCOME_LOG = '0';
    try {
      await buildRecallHookOutput(
        JSON.stringify({ hook_event_name: 'PostToolUse', tool_input: { file_path: 'src/x.ts' } }),
        root,
      );
    } finally {
      if (prev === undefined) delete process.env.AGENTSMESH_LESSONS_OUTCOME_LOG;
      else process.env.AGENTSMESH_LESSONS_OUTCOME_LOG = prev;
    }
    expect(readOutcomeLog(root)).toEqual([]);
  });
});
