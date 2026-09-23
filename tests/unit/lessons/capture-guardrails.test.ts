import { describe, expect, it } from 'vitest';
import {
  inspectCapturedLesson,
  MAX_RECOMMENDED_TRIGGERS,
  WIDE_GLOB_MATCH_COUNT,
} from '../../../src/lessons/capture-guardrails.js';
import { nearDuplicateWarning } from '../../../src/lessons/capture-near-duplicate.js';
import type { Lesson, LessonsGraph, Trigger } from '../../../src/lessons/graph-schema.js';
import { graphWith } from '../../helpers/lessons-liveness-fixture.js';

function codes(g: LessonsGraph): string[] {
  return inspectCapturedLesson(g, 'L').map((w) => w.code);
}

describe('inspectCapturedLesson', () => {
  it('warns when a lesson carries more than the recommended number of triggers', () => {
    const triggers: Record<string, Trigger> = {};
    for (let i = 0; i <= MAX_RECOMMENDED_TRIGGERS; i += 1) {
      triggers[`f${i}`] = { kind: 'file_glob', pattern: `src/a${i}.ts` };
    }
    expect(codes(graphWith(triggers))).toContain('OVERSIZED_LESSON_TRIGGERS');
  });

  it('does not warn at exactly the recommended trigger count', () => {
    const triggers: Record<string, Trigger> = {};
    for (let i = 0; i < MAX_RECOMMENDED_TRIGGERS; i += 1) {
      triggers[`f${i}`] = { kind: 'file_glob', pattern: `src/a${i}.ts` };
    }
    expect(codes(graphWith(triggers))).not.toContain('OVERSIZED_LESSON_TRIGGERS');
  });

  it.each([['src/**'], ['**/*.ts'], ['*'], ['**'], ['src/**/*.test.ts']])(
    'flags broad file glob %s',
    (pattern) => {
      const g = graphWith({ f: { kind: 'file_glob', pattern } });
      expect(codes(g)).toContain('BROAD_GLOB_TRIGGER');
    },
  );

  it.each([['src/cli/foo.ts'], ['src/lessons/ranking.ts'], ['src/*.ts'], ['src/**/index.ts']])(
    'does not flag specific file glob %s',
    (pattern) => {
      const g = graphWith({ f: { kind: 'file_glob', pattern } });
      expect(codes(g)).not.toContain('BROAD_GLOB_TRIGGER');
    },
  );

  it('warns WIDE_GLOB_MATCH when a non-broad glob matches many working-tree files', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/lib/*.ts' } });
    const paths = new Set(
      Array.from({ length: WIDE_GLOB_MATCH_COUNT + 1 }, (_, i) => `src/lib/f${i}.ts`),
    );
    expect(inspectCapturedLesson(g, 'L', paths).map((w) => w.code)).toContain('WIDE_GLOB_MATCH');
  });

  it('does not warn WIDE_GLOB_MATCH when the glob matches few files', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/lib/*.ts' } });
    const paths = new Set(['src/lib/a.ts', 'src/lib/b.ts']);
    expect(inspectCapturedLesson(g, 'L', paths).map((w) => w.code)).not.toContain(
      'WIDE_GLOB_MATCH',
    );
  });

  it('does not double-flag a structurally-broad glob as WIDE_GLOB_MATCH (BROAD_GLOB owns it)', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/**/*.ts' } });
    const paths = new Set(
      Array.from({ length: WIDE_GLOB_MATCH_COUNT + 1 }, (_, i) => `src/x/f${i}.ts`),
    );
    const out = inspectCapturedLesson(g, 'L', paths).map((w) => w.code);
    expect(out).toContain('BROAD_GLOB_TRIGGER');
    expect(out).not.toContain('WIDE_GLOB_MATCH');
  });

  it('skips the breadth check when no working-tree paths are supplied (write-barrier path)', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/lib/*.ts' } });
    expect(codes(g)).not.toContain('WIDE_GLOB_MATCH'); // codes() passes no knownPaths
  });

  it('warns when a lesson has only keyword triggers (dormant on --file/--cmd recall)', () => {
    const g = graphWith({
      k1: { kind: 'keyword', pattern: 'auth' },
      k2: { kind: 'keyword', pattern: 'login' },
    });
    expect(codes(g)).toEqual(['KEYWORD_ONLY_LESSON']);
  });

  it('does not warn keyword-only when at least one file or command trigger is present', () => {
    const g = graphWith({
      k1: { kind: 'keyword', pattern: 'auth' },
      f1: { kind: 'file_glob', pattern: 'src/auth.ts' },
    });
    expect(codes(g)).not.toContain('KEYWORD_ONLY_LESSON');
  });

  it('warns when a keyword trigger is too long to ever match recall', () => {
    const g = graphWith({
      f1: { kind: 'file_glob', pattern: 'src/auth.ts' },
      k1: {
        kind: 'keyword',
        pattern: 'antd Form.useForm getFieldsValue Select filterOption FormData generic cast',
      },
    });
    expect(codes(g)).toContain('LOW_SIGNAL_KEYWORD');
  });

  it('does not flag a short distinctive keyword trigger', () => {
    const g = graphWith({
      f1: { kind: 'file_glob', pattern: 'src/auth.ts' },
      k1: { kind: 'keyword', pattern: 'filterOption cast' },
    });
    expect(codes(g)).not.toContain('LOW_SIGNAL_KEYWORD');
  });

  it('emits both KEYWORD_ONLY_LESSON and LOW_SIGNAL_KEYWORD for a keyword-only lesson with a long pattern', () => {
    const g = graphWith({
      k1: {
        kind: 'keyword',
        pattern: 'antd Form.useForm getFieldsValue Select filterOption FormData generic cast',
      },
    });
    expect(codes(g)).toEqual(expect.arrayContaining(['KEYWORD_ONLY_LESSON', 'LOW_SIGNAL_KEYWORD']));
  });

  it('returns no warnings for a lean, specific lesson', () => {
    const g = graphWith({
      f1: { kind: 'file_glob', pattern: 'src/auth.ts' },
      c1: { kind: 'command_pattern', pattern: 'npm run test' },
    });
    expect(inspectCapturedLesson(g, 'L')).toEqual([]);
  });

  it('returns no warnings for an unknown lesson id', () => {
    expect(inspectCapturedLesson(graphWith({}), 'missing')).toEqual([]);
  });
});

describe('inspectCapturedLesson — STOPWORD_KEYWORD', () => {
  it('warns when a multi-word keyword contains stopwords (structurally unmatchable run)', () => {
    // Needle tokenizes to [state, art]; the haystack keeps "of the", so the
    // phrase can never match contiguously on the --file/--cmd path.
    const g = graphWith({ k: { kind: 'keyword', pattern: 'state of the art' } });
    expect(codes(g)).toContain('STOPWORD_KEYWORD');
  });

  it('does not warn for a stopword-free phrase or a single word', () => {
    expect(codes(graphWith({ k: { kind: 'keyword', pattern: 'windows paths' } }))).not.toContain(
      'STOPWORD_KEYWORD',
    );
    expect(codes(graphWith({ k: { kind: 'keyword', pattern: 'the' } }))).not.toContain(
      'STOPWORD_KEYWORD',
    );
  });

  it('does not inspect non-keyword triggers', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/of/the/art.ts' } });
    expect(codes(g)).not.toContain('STOPWORD_KEYWORD');
  });
});

describe('nearDuplicateWarning (C)', () => {
  function lesson(rule: string, status: Lesson['status'] = 'active'): Lesson {
    return { rule, topics: ['t'], triggers: [], evidence: [], status, createdAt: '2026-06-01' };
  }
  function graphOf(lessons: Record<string, Lesson>): LessonsGraph {
    return { version: 1, lessons, topics: { t: { summary: 'T.' } }, triggers: {} };
  }

  it('fires when a new lesson closely paraphrases an existing active lesson', () => {
    const g = graphOf({
      a: lesson('Run the test suite before committing changes.'),
      b: lesson('Before committing changes run the test suite.'),
    });
    const w = nearDuplicateWarning(g, 'b');
    expect(w?.code).toBe('NEAR_DUPLICATE_LESSON');
    expect(w?.message).toContain('a');
  });

  it('is silent for two clearly distinct lessons (below threshold)', () => {
    const g = graphOf({
      a: lesson('Normalize CLI display paths to forward slashes.'),
      b: lesson('Always migrate a legacy store before the first capture.'),
    });
    expect(nearDuplicateWarning(g, 'b')).toBeNull();
  });

  it('ignores deprecated lessons as duplicate candidates', () => {
    const g = graphOf({
      a: lesson('Run the test suite before committing changes.', 'deprecated'),
      b: lesson('Before committing changes run the test suite.'),
    });
    expect(nearDuplicateWarning(g, 'b')).toBeNull();
  });

  it('returns null for an unknown lesson id', () => {
    expect(nearDuplicateWarning(graphOf({}), 'missing')).toBeNull();
  });
});
