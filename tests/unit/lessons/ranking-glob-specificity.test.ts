/**
 * Trigger ids are content-addressed, so a pinpoint glob and a subsystem-wide
 * one are both referenced once and tie on fanout. Narrowness breaks that tie so
 * the rule written about THIS file outranks the rule about its whole subtree.
 */
import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { queryLessons } from '../../../src/lessons/query.js';
import { rankLessons } from '../../../src/lessons/ranking.js';

const lesson = (rule: string, trigger: string): LessonsGraph['lessons'][string] => ({
  rule,
  topics: ['t'],
  triggers: [trigger],
  evidence: [],
  status: 'active',
  createdAt: '2026-06-01',
});

function graph(): LessonsGraph {
  return {
    version: 1,
    lessons: {
      subtree: lesson('Keep every lessons file at or below two hundred lines.', 'subtree'),
      exact: lesson('The recall entry point takes projectRoot, query and options.', 'exact'),
      fileClass: lesson('Every target index must register its descriptor.', 'fileClass'),
    },
    topics: { t: { summary: 'T.' } },
    triggers: {
      subtree: { kind: 'file_glob', pattern: 'src/lessons/**' },
      exact: { kind: 'file_glob', pattern: 'src/lessons/recall.ts' },
      fileClass: { kind: 'file_glob', pattern: 'src/lessons/*.ts' },
    },
  };
}

function rankedIds(file: string): string[] {
  const g = graph();
  const query = { file };
  return rankLessons(g, query, queryLessons(g, query), {}).map((r) => r.id);
}

describe('ranking: file-glob narrowness', () => {
  it('puts the exact-path lesson first, then the file class, then the subtree', () => {
    expect(rankedIds('src/lessons/recall.ts')).toEqual(['exact', 'fileClass', 'subtree']);
  });

  it('falls back to the narrower survivor when the exact path does not match', () => {
    expect(rankedIds('src/lessons/query.ts')).toEqual(['fileClass', 'subtree']);
  });

  it('reports the narrowness-aware specificity in the rank reason', () => {
    const g = graph();
    const query = { file: 'src/lessons/recall.ts' };
    const ranked = rankLessons(g, query, queryLessons(g, query), {});
    const exact = ranked.find((r) => r.id === 'exact');
    const subtree = ranked.find((r) => r.id === 'subtree');
    expect(exact?.reason.specificity).toBeGreaterThan(subtree?.reason.specificity ?? 0);
  });
});

describe('ranking: a negated glob is the least specific file trigger', () => {
  function negatedGraph(): LessonsGraph {
    return {
      version: 1,
      lessons: {
        // Its wording fits the query best, so only specificity can sink it.
        negated: lesson('Recall lessons for the recall entry point in src lessons.', 'neg'),
        exact: lesson('Keep the public signature stable.', 'exact'),
      },
      topics: { t: { summary: 'T.' } },
      triggers: {
        neg: { kind: 'file_glob', pattern: '!vendor/lock.json' },
        exact: { kind: 'file_glob', pattern: 'src/lessons/recall.ts' },
      },
    };
  }

  it('ranks an exact-path lesson above a negated-glob lesson and scores the negation at zero', () => {
    const g = negatedGraph();
    const query = { file: 'src/lessons/recall.ts' };
    const ranked = rankLessons(g, query, queryLessons(g, query), {});
    expect(ranked.map((r) => r.id)).toEqual(['exact', 'negated']);
    expect(ranked.find((r) => r.id === 'negated')?.reason.specificity).toBe(0);
  });
});

describe('ranking: an incidental keyword hit is weaker than an exact path', () => {
  function mixedGraph(): LessonsGraph {
    return {
      version: 1,
      lessons: {
        byKeyword: lesson('Use the MCP field names when the CLI lacks the subcommand.', 'kw'),
        byPath: lesson('The recall entry point takes projectRoot, query and options.', 'exact'),
      },
      topics: { t: { summary: 'T.' } },
      triggers: {
        kw: { kind: 'keyword', pattern: 'lessons recall' },
        exact: { kind: 'file_glob', pattern: 'src/lessons/recall.ts' },
      },
    };
  }

  it('ranks the exact-path lesson above one matched only through path tokens', () => {
    const g = mixedGraph();
    const query = { file: 'src/lessons/recall.ts' };
    const ranked = rankLessons(g, query, queryLessons(g, query), {});
    expect(ranked.map((r) => r.id)[0]).toBe('byPath');
  });

  it('leaves a keyword-only query unchanged, since every match ties on the signal', () => {
    const g = mixedGraph();
    const query = { keyword: 'lessons recall' };
    const matches = queryLessons(g, query);
    expect(matches.map((m) => m.id)).toEqual(['byKeyword']);
    expect(rankLessons(g, query, matches, {}).map((r) => r.id)).toEqual(['byKeyword']);
  });
});
