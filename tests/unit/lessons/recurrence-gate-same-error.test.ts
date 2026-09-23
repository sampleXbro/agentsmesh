import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '../../../src/lessons/context-key.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { recordFailure } from '../../../src/lessons/outcome-log.js';
import { recurrenceEscalation } from '../../../src/lessons/recurrence-gate.js';
import { graphOf } from './hook-test-helpers.js';

const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;
const command = 'git commit -m wip';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recurrence-same-error-'));
  saveLessonsGraph(
    root,
    graphOf({
      l2: {
        rule: 'commit with care',
        trigger: { kind: 'command_pattern', pattern: 'git commit -m' },
      },
    }),
  );
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const escalate = (): string | null =>
  recurrenceEscalation(root, [{ command }], `same-error-${process.pid}`)?.text ?? null;

describe('recurrenceEscalation — same error, not just same program', () => {
  it('stays quiet when the failures under one action class were different errors', () => {
    // `cat a` and `cat b` share the key `cmd:cat`; six unrelated errors are not
    // one recurring problem, and claiming otherwise is what made ordinary reads
    // look like defects.
    const key = contextKey({ command }, root);
    recordFailure(root, key, 'error one', ON, 's1');
    recordFailure(root, key, 'error two', ON, 's1');
    recordFailure(root, key, 'error three', ON, 's1');

    expect(escalate()).toBeNull();
  });

  it('escalates when the same error recurred, and says how many times', () => {
    const key = contextKey({ command }, root);
    recordFailure(root, key, 'hook rejected the commit', ON, 's1');
    recordFailure(root, key, 'unrelated blip', ON, 's1');
    recordFailure(root, key, 'hook rejected the commit', ON, 's1');

    const out = escalate();
    expect(out).toContain('failed 2× with the same error');
    expect(out).toContain('commit with care');
  });

  it('stays quiet when the harness reported no error signature at all', () => {
    const key = contextKey({ command }, root);
    recordFailure(root, key, undefined, ON, 's1');
    recordFailure(root, key, undefined, ON, 's1');

    expect(escalate()).toBeNull();
  });
});
