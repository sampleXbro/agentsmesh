import { describe, expect, it } from 'vitest';
import type { LessonsGraph, Trigger } from '../../../src/lessons/graph-schema.js';
import { collectMatchedTriggersByKind, queryLessons } from '../../../src/lessons/query.js';
import { timed } from '../../helpers/timing.js';

const HOSTILE_EXTGLOB = '**/' + '+(*)'.repeat(12) + 'ZZZ';

function graphWith(triggers: Record<string, Trigger>): LessonsGraph {
  const lessons: LessonsGraph['lessons'] = {};
  for (const id of Object.keys(triggers)) {
    lessons[`lesson-${id}`] = {
      rule: `Rule for ${id}.`,
      topics: ['t'],
      triggers: [id],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    };
  }
  return { version: 2, lessons, topics: { t: { summary: 'T' } }, triggers };
}

describe('queryLessons — file_glob matching cannot be slowed by a hostile graph', () => {
  it('treats the nested-extglob repro as a non-match and stays fast', () => {
    const graph = graphWith({
      't-hostile': { kind: 'file_glob', pattern: HOSTILE_EXTGLOB },
      't-legit': { kind: 'file_glob', pattern: 'src/**/*.ts' },
    });
    // Before the fix this single call took ~5 s (exponential in the repeat count).
    const { value: ids, ms } = timed(() =>
      queryLessons(graph, { file: 'src/index.ts' }).map((m) => m.id),
    );
    expect(ids).toEqual(['lesson-t-legit']);
    expect(ms).toBeLessThan(50);
  });

  it('does not match a hostile glob even on a path that would satisfy it literally', () => {
    const graph = graphWith({ 't-hostile': { kind: 'file_glob', pattern: '(a|aa)+b' } });
    const matched = collectMatchedTriggersByKind(graph, { file: 'aab' });
    expect([...matched.file_glob]).toEqual([]);
  });

  it('bounds total glob work across many near-cap star-heavy triggers', () => {
    // Legit trigger first: once the shared budget is spent, later globs degrade
    // to non-matches (never a false positive), mirroring command patterns.
    const triggers: Record<string, Trigger> = {
      't-legit': { kind: 'file_glob', pattern: '**/*.md' },
    };
    for (let i = 0; i < 200; i += 1) {
      triggers[`t-star-${i}`] = { kind: 'file_glob', pattern: `${'*a'.repeat(40)}*z${i}*.md` };
    }
    const graph = graphWith(triggers);
    const { value: ids, ms } = timed(() =>
      queryLessons(graph, { file: `docs/${'a'.repeat(3000)}.md` }).map((m) => m.id),
    );
    expect(ids).toEqual(['lesson-t-legit']);
    expect(ms).toBeLessThan(500);
  });
});
