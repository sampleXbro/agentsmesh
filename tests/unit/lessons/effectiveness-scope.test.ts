/**
 * Recall ranks a handful of candidates, so it only needs their effectiveness.
 * Scoping the computation to them must give the same scores as the full run.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { appendOutcomeEvent, loadEffectiveness } from '../../../src/lessons/outcome-log.js';

const ON = { AGENTSMESH_LESSONS_OUTCOME_LOG: '1' } as NodeJS.ProcessEnv;

const lesson = (trigger: string): LessonsGraph['lessons'][string] => ({
  rule: 'r',
  topics: ['t'],
  triggers: [trigger],
  evidence: [],
  status: 'active',
  createdAt: '2026-01-01',
});

const graph: LessonsGraph = {
  version: 2,
  topics: { t: { summary: 'T' } },
  triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
  lessons: { a: lesson('g'), b: lesson('g') },
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-eff-scope-'));
  for (const id of ['a', 'b']) {
    for (let i = 0; i < 3; i += 1) {
      const session = `${id}${i}`;
      const key = 'file:src/x.ts';
      appendOutcomeEvent(
        root,
        { ts: '2026-01-01T00:00:00Z', kind: 'delivered', lessonId: id, contextKey: key, session },
        ON,
      );
      appendOutcomeEvent(
        root,
        { ts: '2026-01-01T00:01:00Z', kind: 'failure', contextKey: key, session },
        ON,
      );
    }
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('loadEffectiveness scoped to recall candidates', () => {
  it('scores only the asked lessons, with the same values as the full run', () => {
    const full = loadEffectiveness(root, graph);
    const scoped = loadEffectiveness(root, graph, new Set(['a']));
    expect([...scoped.keys()]).toEqual(['a']);
    expect(scoped.get('a')).toBe(full.get('a'));
    expect(full.get('a')).toBe(0);
  });
});
