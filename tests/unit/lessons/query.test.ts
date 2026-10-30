import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import {
  collectAlwaysLessons,
  collectMatchedTriggersByKind,
  queryLessons,
} from '../../../src/lessons/query.js';

const graph: LessonsGraph = {
  version: 1,
  lessons: {
    'glob-only': {
      rule: 'G.',
      topics: ['t'],
      triggers: ['t-src-glob'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    },
    'cmd-only': {
      rule: 'C.',
      topics: ['t'],
      triggers: ['t-test-cmd'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    },
    'kw-only': {
      rule: 'K.',
      topics: ['t'],
      triggers: ['t-keyword'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    },
    'multi-trigger': {
      rule: 'M.',
      topics: ['t'],
      triggers: ['t-src-glob', 't-test-cmd'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    },
    'deprecated-rule': {
      rule: 'D.',
      topics: ['t'],
      triggers: ['t-src-glob'],
      evidence: [],
      status: 'deprecated',
      createdAt: '2026-06-01',
    },
    'superseded-rule': {
      rule: 'S.',
      topics: ['t'],
      triggers: ['t-src-glob'],
      evidence: [],
      status: 'superseded',
      supersededBy: 'glob-only',
      createdAt: '2026-06-01',
    },
  },
  topics: { t: { summary: 'Topic.' } },
  triggers: {
    't-src-glob': { kind: 'file_glob', pattern: 'src/**/*.ts' },
    't-test-cmd': { kind: 'command_pattern', pattern: '^pnpm test' },
    't-keyword': { kind: 'keyword', pattern: 'windows' },
  },
};

describe('queryLessons', () => {
  it('matches file_glob triggers and returns ids in alphabetical order', () => {
    const r = queryLessons(graph, { file: 'src/a.ts' });
    expect(r.map((x) => x.id)).toEqual(['glob-only', 'multi-trigger']);
  });

  it('matches command_pattern triggers against the command string', () => {
    const r = queryLessons(graph, { command: 'pnpm test --watch' });
    expect(r.map((x) => x.id)).toEqual(['cmd-only', 'multi-trigger']);
  });

  it('matches keyword triggers case-insensitively', () => {
    const r = queryLessons(graph, { keyword: 'Windows path bug' });
    expect(r.map((x) => x.id)).toEqual(['kw-only']);
  });

  it('combines file + command + keyword as OR across triggers', () => {
    const r = queryLessons(graph, {
      file: 'src/a.ts',
      command: 'pnpm test',
      keyword: 'windows',
    });
    expect(r.map((x) => x.id)).toEqual(['cmd-only', 'glob-only', 'kw-only', 'multi-trigger']);
  });

  it('deduplicates lessons matched via multiple triggers', () => {
    const r = queryLessons(graph, { file: 'src/a.ts', command: 'pnpm test' });
    const ids = r.map((x) => x.id);
    expect(ids.filter((id) => id === 'multi-trigger').length).toBe(1);
  });

  it('excludes deprecated lessons', () => {
    const r = queryLessons(graph, { file: 'src/a.ts' });
    expect(r.find((x) => x.id === 'deprecated-rule')).toBeUndefined();
  });

  it('excludes superseded lessons', () => {
    const r = queryLessons(graph, { file: 'src/a.ts' });
    expect(r.find((x) => x.id === 'superseded-rule')).toBeUndefined();
  });

  it('returns empty when no predicate is supplied', () => {
    expect(queryLessons(graph, {})).toEqual([]);
  });

  it('excludes always-on lessons from triggered recall but collects them separately', () => {
    // An always-lesson that ALSO matches a file trigger must NOT surface via
    // queryLessons (it is delivered on every task), but collectAlwaysLessons returns it.
    const g: LessonsGraph = {
      version: 2,
      lessons: {
        'always-one': {
          rule: 'A.',
          topics: ['t'],
          triggers: ['t-src-glob'],
          evidence: [],
          status: 'active',
          scope: 'always',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: { 't-src-glob': { kind: 'file_glob', pattern: 'src/**' } },
    };
    expect(queryLessons(g, { file: 'src/a.ts' })).toEqual([]);
    expect(collectAlwaysLessons(g).map((m) => m.id)).toEqual(['always-one']);
  });

  it('collectMatchedTriggersByKind partitions matched trigger ids by kind', () => {
    const byKind = collectMatchedTriggersByKind(graph, {
      file: 'src/a.ts',
      command: 'pnpm test',
      keyword: 'windows',
    });
    expect([...byKind.file_glob]).toEqual(['t-src-glob']);
    expect([...byKind.command_pattern]).toEqual(['t-test-cmd']);
    expect([...byKind.keyword]).toEqual(['t-keyword']);
  });

  it('collectMatchedTriggersByKind only fills the kinds whose predicate is supplied', () => {
    const byKind = collectMatchedTriggersByKind(graph, { file: 'src/a.ts' });
    expect([...byKind.file_glob]).toEqual(['t-src-glob']);
    expect(byKind.command_pattern.size).toBe(0);
    expect(byKind.keyword.size).toBe(0);
  });

  it('surfaces a keyword-only lesson on a file-only query via the derived haystack', () => {
    // No --keyword supplied; the keyword trigger "windows" fires off the file path.
    const r = queryLessons(graph, { file: 'src/windows-path-fix.ts' });
    expect(r.map((x) => x.id)).toContain('kw-only');
  });

  it('surfaces a keyword-only lesson on a command-only query via the derived haystack', () => {
    const r = queryLessons(graph, { command: 'wsl windows test' });
    expect(r.map((x) => x.id)).toContain('kw-only');
  });

  it('does not fire a keyword trigger on an unrelated file (token-boundary, not substring)', () => {
    const r = queryLessons(graph, { file: 'src/ranking.ts' });
    expect(r.map((x) => x.id)).not.toContain('kw-only');
  });

  it('returns empty when nothing matches', () => {
    expect(queryLessons(graph, { file: 'docs/readme.md' })).toEqual([]);
  });

  it('treats an invalid command_pattern regex as a non-match without throwing', () => {
    const broken: LessonsGraph = {
      ...graph,
      triggers: {
        ...graph.triggers,
        'bad-regex': { kind: 'command_pattern', pattern: '(' },
      },
      lessons: {
        ...graph.lessons,
        'bad-rule': {
          rule: 'BR.',
          topics: ['t'],
          triggers: ['bad-regex'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
    };
    expect(() => queryLessons(broken, { command: 'anything' })).not.toThrow();
    expect(queryLessons(broken, { command: 'anything' })).toEqual([]);
  });

  it('matches a backtracking-shaped command_pattern in linear time (no hang)', () => {
    const evil: LessonsGraph = {
      ...graph,
      triggers: {
        ...graph.triggers,
        'redos-regex': { kind: 'command_pattern', pattern: '(a+)+$' },
      },
      lessons: {
        ...graph.lessons,
        'redos-rule': {
          rule: 'RR.',
          topics: ['t'],
          triggers: ['redos-regex'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
    };
    // An adversarial input that would hang a backtracking engine — the linear
    // engine evaluates it correctly. Its work bound is in regex-linear.test.ts.
    const noMatch = queryLessons(evil, { command: 'a'.repeat(60) + '!' });
    expect(noMatch.find((x) => x.id === 'redos-rule')).toBeUndefined(); // trailing '!' ⇒ no $ match
    expect(
      queryLessons(evil, { command: 'aaaa' }).find((x) => x.id === 'redos-rule'),
    ).toBeDefined();
  });

  it('skips a command_pattern the linear engine cannot evaluate (lookaround) as a non-match', () => {
    const unsupported: LessonsGraph = {
      ...graph,
      triggers: {
        ...graph.triggers,
        'la-regex': { kind: 'command_pattern', pattern: '(?=pnpm)pnpm' },
      },
      lessons: {
        ...graph.lessons,
        'la-rule': {
          rule: 'LA.',
          topics: ['t'],
          triggers: ['la-regex'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
    };
    expect(
      queryLessons(unsupported, { command: 'pnpm test' }).find((x) => x.id === 'la-rule'),
    ).toBeUndefined();
  });

  it('returns the full Lesson object alongside the id', () => {
    const r = queryLessons(graph, { file: 'src/a.ts' });
    expect(r[0]?.lesson.rule).toBe('G.');
    expect(r[0]?.lesson.topics).toEqual(['t']);
  });
});

describe('queryLessons — word-bounded command class (the capture-nudge hint shape)', () => {
  const bounded: LessonsGraph = {
    version: 1,
    lessons: {
      'rm-rule': {
        rule: 'R.',
        topics: ['t'],
        triggers: ['t-rm'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: { 't-rm': { kind: 'command_pattern', pattern: '\\brm\\b' } },
  };

  it('fires on the command class itself', () => {
    expect(queryLessons(bounded, { command: 'rm -rf build' }).map((x) => x.id)).toEqual([
      'rm-rule',
    ]);
  });

  it('does not fire when the class is only a mid-word fragment (`pnpm run format`)', () => {
    expect(queryLessons(bounded, { command: 'pnpm run format' })).toEqual([]);
  });
});
