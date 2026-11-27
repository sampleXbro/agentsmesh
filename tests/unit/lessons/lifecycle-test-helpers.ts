import type { Lesson, LessonsGraph } from '../../../src/lessons/graph-schema.js';

/** An active lesson on the shared topic `t` and trigger `g`. */
export function lesson(rule: string, extra: Partial<Lesson> = {}): Lesson {
  return {
    rule,
    topics: ['t'],
    triggers: ['g'],
    evidence: [],
    status: 'active',
    createdAt: '2026-01-01',
    ...extra,
  };
}

/** A graph with one topic `t`, one file trigger `g` (src/lessons/*.ts), and the given lessons. */
export function graphOf(lessons: Record<string, Lesson>): LessonsGraph {
  return {
    version: 2,
    topics: { t: { summary: 'T.' } },
    triggers: { g: { kind: 'file_glob', pattern: 'src/lessons/*.ts' } },
    lessons,
  };
}

/** The first error thrown by `fn`, or undefined when it did not throw. */
export function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

/** The rejection of `p`, or undefined when it resolved. */
export async function rejected(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => undefined,
    (err: unknown) => err,
  );
}
