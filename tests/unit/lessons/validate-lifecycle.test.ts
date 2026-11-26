import { describe, expect, it } from 'vitest';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';
import { graphOf, lesson } from './lifecycle-test-helpers.js';

const codes = (graph: ReturnType<typeof graphOf>): string[] =>
  validateLessonsGraph(graph).findings.map((f) => f.code);

describe('always-on lessons need no trigger', () => {
  it('a trigger-less always-on lesson is not UNREACHABLE_LESSON', () => {
    const graph = graphOf({
      always: lesson('Universal rule.', { scope: 'always', triggers: [] }),
      other: lesson('Other rule.'),
    });
    const report = validateLessonsGraph(graph);
    expect(report.ok).toBe(true);
    expect(codes(graph)).toEqual([]);
  });

  it('a trigger-less triggered lesson is still UNREACHABLE_LESSON', () => {
    const graph = graphOf({
      plain: lesson('Plain rule.', { triggers: [] }),
      other: lesson('Other rule.'),
    });
    expect(validateLessonsGraph(graph).findings).toContainEqual(
      expect.objectContaining({ level: 'warning', code: 'UNREACHABLE_LESSON', lessonId: 'plain' }),
    );
  });
});

describe('a retired lineage is a valid chain', () => {
  it('a deprecated lesson that keeps its pointer to a deprecated lesson is valid', () => {
    const graph = graphOf({
      x: lesson('X.', { status: 'deprecated', supersededBy: 'b' }),
      b: lesson('B.', { status: 'deprecated' }),
      other: lesson('Other.'),
    });
    expect(validateLessonsGraph(graph).ok).toBe(true);
    expect(codes(graph)).toEqual([]);
  });

  it('a superseded lesson pointing at a deprecated lesson is still INACTIVE_SUPERSEDER', () => {
    const graph = graphOf({
      x: lesson('X.', { status: 'superseded', supersededBy: 'b' }),
      b: lesson('B.', { status: 'deprecated' }),
    });
    expect(validateLessonsGraph(graph).findings).toContainEqual(
      expect.objectContaining({ level: 'error', code: 'INACTIVE_SUPERSEDER', lessonId: 'x' }),
    );
  });

  it('a deprecated lesson pointing at a missing lesson is still DANGLING_SUPERSEDER', () => {
    const graph = graphOf({
      x: lesson('X.', { status: 'deprecated', supersededBy: 'ghost' }),
      other: lesson('Other.'),
    });
    expect(validateLessonsGraph(graph).findings).toContainEqual(
      expect.objectContaining({ level: 'error', code: 'DANGLING_SUPERSEDER', lessonId: 'x' }),
    );
  });

  it('a deprecated lesson pointing at itself is still SELF_SUPERSEDED', () => {
    const graph = graphOf({
      x: lesson('X.', { status: 'deprecated', supersededBy: 'x' }),
      other: lesson('Other.'),
    });
    expect(codes(graph)).toContain('SELF_SUPERSEDED');
  });

  it('a pointer cycle among retired lessons is still SUPERSEDE_CYCLE', () => {
    const graph = graphOf({
      x: lesson('X.', { status: 'deprecated', supersededBy: 'b' }),
      b: lesson('B.', { status: 'deprecated', supersededBy: 'x' }),
      other: lesson('Other.'),
    });
    expect(codes(graph)).toContain('SUPERSEDE_CYCLE');
  });
});
