import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contextKey } from '../../../src/lessons/context-key.js';
import { graphFilePath } from '../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { recordFailure } from '../../../src/lessons/outcome-log.js';
import { hasCoveringLesson, recurrenceEscalation } from '../../../src/lessons/recurrence-gate.js';
import { clearSeen } from '../../../src/lessons/seen-cache.js';

const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;

const GRAPH: LessonsGraph = {
  version: 2,
  topics: { t: { summary: 't' } },
  triggers: {
    'glob-src': { kind: 'file_glob', pattern: 'src/**' },
    'cmd-commit': { kind: 'command_pattern', pattern: 'git commit -m' },
    'cmd-grep': { kind: 'command_pattern', pattern: 'grep' },
  },
  lessons: {
    l1: {
      rule: 'edit src carefully',
      topics: ['t'],
      triggers: ['glob-src'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
    l2: {
      rule: 'commit with care',
      topics: ['t'],
      triggers: ['cmd-commit'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
    l3: {
      rule: 'grep carefully',
      topics: ['t'],
      triggers: ['cmd-grep'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
  },
};

let root: string;
let prevSession: string | undefined;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recurrence-gate-'));
  const p = graphFilePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(GRAPH), 'utf8');
  prevSession = process.env.AGENTSMESH_SESSION_ID;
  delete process.env.AGENTSMESH_SESSION_ID;
});
afterEach(() => {
  if (prevSession !== undefined) process.env.AGENTSMESH_SESSION_ID = prevSession;
  rmSync(root, { recursive: true, force: true });
});

// Seeds the realistic case: the SAME error recurring, which is what the gate
// now requires. A run with no error signature is covered by its own test.
const seedFailures = (key: string, times: number, errorClass = 'same error'): void => {
  for (let i = 0; i < times; i += 1) recordFailure(root, key, errorClass, ON);
};

describe('recurrenceEscalation', () => {
  it('returns null when the action has no failure history (no outcome log)', () => {
    expect(recurrenceEscalation(root, { file: 'src/x.ts' })).toBeNull();
  });

  it('returns null below the recurrence threshold', () => {
    seedFailures(contextKey({ file: 'src/x.ts' }, root), 1);
    expect(recurrenceEscalation(root, { file: 'src/x.ts' })).toBeNull();
  });

  it('escalates at the threshold with the failure count and the covering rule', () => {
    seedFailures(contextKey({ file: 'src/x.ts' }, root), 2);
    const out = recurrenceEscalation(root, { file: 'src/x.ts' });
    expect(out).toContain('failed 2×');
    expect(out).toContain('edit src carefully');
  });

  it('returns null when no lesson covers the recurring action', () => {
    seedFailures(contextKey({ file: 'docs/y.md' }, root), 3);
    expect(recurrenceEscalation(root, { file: 'docs/y.md' })).toBeNull();
  });

  it('fires once per action per session — the second call is suppressed', () => {
    seedFailures(contextKey({ file: 'src/x.ts' }, root), 2);
    expect(recurrenceEscalation(root, { file: 'src/x.ts', sessionId: 'rg1' })).not.toBeNull();
    expect(recurrenceEscalation(root, { file: 'src/x.ts', sessionId: 'rg1' })).toBeNull();
  });

  it('is stateless without a session id — repeated calls both escalate', () => {
    seedFailures(contextKey({ file: 'src/x.ts' }, root), 2);
    expect(recurrenceEscalation(root, { file: 'src/x.ts' })).not.toBeNull();
    expect(recurrenceEscalation(root, { file: 'src/x.ts' })).not.toBeNull();
  });

  it('matches coverage on the RAW command while grouping recurrence by the normalized key', () => {
    const raw = 'git commit -m "wip"';
    seedFailures(contextKey({ command: raw }, root), 2);
    const out = recurrenceEscalation(root, { command: raw });
    expect(out).toContain('commit with care');
  });

  it('returns null for an action-less input', () => {
    expect(recurrenceEscalation(root, {})).toBeNull();
  });

  it('escalates again after clearSeen resets the session (compaction recovery)', () => {
    seedFailures(contextKey({ file: 'src/x.ts' }, root), 2);
    expect(recurrenceEscalation(root, { file: 'src/x.ts', sessionId: 'rg2' })).not.toBeNull();
    expect(recurrenceEscalation(root, { file: 'src/x.ts', sessionId: 'rg2' })).toBeNull();
    clearSeen('rg2', root);
    expect(recurrenceEscalation(root, { file: 'src/x.ts', sessionId: 'rg2' })).not.toBeNull();
  });

  it('returns null (never throws) on a corrupt graph', () => {
    seedFailures(contextKey({ file: 'src/x.ts' }, root), 2);
    writeFileSync(graphFilePath(root), '{not json', 'utf8');
    expect(recurrenceEscalation(root, { file: 'src/x.ts' })).toBeNull();
  });

  it('caps the escalation at two covering rules', () => {
    const wide: LessonsGraph = {
      ...GRAPH,
      lessons: {
        ...GRAPH.lessons,
        l3: {
          rule: 'rule three',
          topics: ['t'],
          triggers: ['glob-src'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
        l4: {
          rule: 'rule four',
          topics: ['t'],
          triggers: ['glob-src'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
      },
    };
    writeFileSync(graphFilePath(root), JSON.stringify(wide), 'utf8');
    seedFailures(contextKey({ file: 'src/x.ts' }, root), 2);
    const out = recurrenceEscalation(root, { file: 'src/x.ts' });
    expect(out).not.toBeNull();
    expect(out!.split('\n- ').length - 1).toBe(2);
  });
});

describe('hasCoveringLesson (moved from hook.ts)', () => {
  it('is true for a covered file and false for an uncovered one', () => {
    expect(hasCoveringLesson(root, 'src/x.ts', undefined)).toBe(true);
    expect(hasCoveringLesson(root, 'docs/y.md', undefined)).toBe(false);
  });

  it('matches command triggers against the raw command text', () => {
    expect(hasCoveringLesson(root, undefined, 'git commit -m "wip"')).toBe(true);
    expect(hasCoveringLesson(root, undefined, 'git push')).toBe(false);
  });
});

describe('recurrenceEscalation — same error, not just same program', () => {
  it('stays quiet when the failures under one action class were different errors', () => {
    // `cat a` and `cat b` share the key `cmd:cat`; six unrelated errors are not
    // one recurring problem, and claiming otherwise is what made ordinary reads
    // look like defects.
    const command = 'git commit -m wip';
    const key = contextKey({ command }, root);
    recordFailure(root, key, 'error one', ON, 's1');
    recordFailure(root, key, 'error two', ON, 's1');
    recordFailure(root, key, 'error three', ON, 's1');

    expect(recurrenceEscalation(root, { command, sessionId: 's1' })).toBeNull();
  });

  it('escalates when the same error recurred, and says how many times', () => {
    const command = 'git commit -m wip';
    const key = contextKey({ command }, root);
    recordFailure(root, key, 'hook rejected the commit', ON, 's1');
    recordFailure(root, key, 'unrelated blip', ON, 's1');
    recordFailure(root, key, 'hook rejected the commit', ON, 's1');

    const out = recurrenceEscalation(root, { command, sessionId: 's1' });
    expect(out).toContain('failed 2× with the same error');
    expect(out).toContain('commit with care');
  });

  it('stays quiet when the harness reported no error signature at all', () => {
    const command = 'git commit -m wip';
    const key = contextKey({ command }, root);
    recordFailure(root, key, undefined, ON, 's1');
    recordFailure(root, key, undefined, ON, 's1');

    expect(recurrenceEscalation(root, { command, sessionId: 's1' })).toBeNull();
  });
});
