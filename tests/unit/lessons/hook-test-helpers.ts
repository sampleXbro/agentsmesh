import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';

type Lesson = LessonsGraph['lessons'][string];
type Trigger = LessonsGraph['triggers'][string];

/** A graph where each lesson has exactly one trigger, keyed `<id>-t`. */
export function graphOf(entries: Record<string, { rule: string; trigger: Trigger }>): LessonsGraph {
  const lessons: Record<string, Lesson> = {};
  const triggers: Record<string, Trigger> = {};
  for (const [id, { rule, trigger }] of Object.entries(entries)) {
    lessons[id] = {
      rule,
      topics: ['t'],
      triggers: [`${id}-t`],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-05',
    };
    triggers[`${id}-t`] = trigger;
  }
  return { version: 2, lessons, topics: { t: { summary: 'T.' } }, triggers };
}

/** The injected additionalContext, or '' when the hook emitted nothing. */
export function contextOf(output: string): string {
  if (output === '') return '';
  const parsed = JSON.parse(output) as { hookSpecificOutput: { additionalContext: string } };
  return parsed.hookSpecificOutput.additionalContext;
}

/** Temp project root per test, seeded with `graph`; env isolated from the host session. */
export function useHookProject(graph: () => LessonsGraph): {
  root: () => string;
  session: (label: string) => string;
} {
  let root = '';
  let n = 0;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'amesh-hookfix-'));
    saveLessonsGraph(root, graph());
    vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
    vi.stubEnv('AGENTSMESH_SESSION_ID', '');
    vi.stubEnv('CLAUDE_PROJECT_DIR', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root: () => root,
    session: (label) => `hookfix-${label}-${process.pid}-${Date.now()}-${n++}`,
  };
}
