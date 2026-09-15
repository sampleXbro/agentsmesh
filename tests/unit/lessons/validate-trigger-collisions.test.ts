/**
 * Lessons that share an identical trigger set score identically on specificity,
 * so when more of them match than the cap delivers, which ones an agent sees
 * falls to much weaker signals. `validate` should name that.
 */

import { describe, expect, it } from 'vitest';
import { collectTriggerSetCollisions } from '../../../src/lessons/validate-quality.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import type { ValidationFinding } from '../../../src/lessons/validate.js';

function graph(spec: Record<string, string[]>): LessonsGraph {
  const lessons: LessonsGraph['lessons'] = {};
  const triggers: LessonsGraph['triggers'] = {};
  for (const [id, triggerIds] of Object.entries(spec)) {
    lessons[id] = {
      createdAt: '2026-09-15',
      evidence: ['probe'],
      rule: `Rule ${id}`,
      status: 'active',
      topics: ['general'],
      triggers: triggerIds,
    } as LessonsGraph['lessons'][string];
    for (const t of triggerIds) {
      triggers[t] = {
        kind: 'file_glob',
        pattern: `src/${t}.ts`,
      } as LessonsGraph['triggers'][string];
    }
  }
  return { version: 2, lessons, topics: { general: { summary: 'General' } }, triggers };
}

function run(g: LessonsGraph): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  collectTriggerSetCollisions(g, findings);
  return findings;
}

describe('collectTriggerSetCollisions', () => {
  it('flags a trigger set shared by more lessons than recall can deliver', () => {
    const spec: Record<string, string[]> = {};
    for (let i = 0; i < 7; i++) spec[`l-${i}`] = ['t-a'];

    const findings = run(graph(spec));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('TIED_TRIGGER_SETS');
    expect(findings[0]?.level).toBe('warning');
    expect(findings[0]?.message).toContain('7');
    expect(findings[0]?.lessonIds).toHaveLength(7);
  });

  it('stays quiet when a shared set holds no more lessons than the cap', () => {
    const spec: Record<string, string[]> = {};
    for (let i = 0; i < 5; i++) spec[`l-${i}`] = ['t-a'];

    expect(run(graph(spec))).toEqual([]);
  });

  it('treats a different trigger set as a different group', () => {
    const spec: Record<string, string[]> = {};
    for (let i = 0; i < 4; i++) spec[`l-a-${i}`] = ['t-a'];
    for (let i = 0; i < 4; i++) spec[`l-b-${i}`] = ['t-b'];

    expect(run(graph(spec))).toEqual([]);
  });

  it('matches on the whole set, so order does not split a group', () => {
    const spec: Record<string, string[]> = {};
    for (let i = 0; i < 6; i++) spec[`l-${i}`] = i % 2 === 0 ? ['t-a', 't-b'] : ['t-b', 't-a'];

    const findings = run(graph(spec));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.lessonIds).toHaveLength(6);
  });

  it('ignores lessons that are not active', () => {
    const g = graph(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`l-${i}`, ['t-a']])));
    for (const id of ['l-0', 'l-1', 'l-2']) {
      g.lessons[id] = { ...g.lessons[id]!, status: 'deprecated' };
    }

    expect(run(g)).toEqual([]);
  });
});
