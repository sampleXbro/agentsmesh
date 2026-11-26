import type { Lesson, LessonsGraph } from '../../src/lessons/graph-schema.js';
import { serializeGraph } from '../../src/lessons/graph-store.js';
import { lesson } from './lessons-graph-fixture.js';

type Triggers = LessonsGraph['triggers'];

/** An active lesson that carries the given trigger ids. */
export const triggered = (rule: string, triggers: string[]): Lesson => ({
  ...lesson(rule),
  triggers,
});

export function graphWithTriggers(lessons: Record<string, Lesson>, triggers: Triggers): string {
  return serializeGraph({ version: 2, lessons, topics: { t: { summary: 'T.' } }, triggers });
}

const glob = (pattern: string): Triggers[string] => ({ kind: 'file_glob', pattern });

/**
 * Base `l0` (trigger g0). This branch adds `a` with a second trigger g1; the
 * incoming branch adds `b`. `untriggerLesson(graph, 'a', 'g1')` is then a
 * valid repair of the combined graph.
 */
export const TRIGGERED_CAPTURES = {
  base: graphWithTriggers({ l0: triggered('Base.', ['g0']) }, { g0: glob('src/a.ts') }),
  ours: graphWithTriggers(
    { a: triggered('Ours A.', ['g0', 'g1']), l0: triggered('Base.', ['g0']) },
    { g0: glob('src/a.ts'), g1: glob('src/b.ts') },
  ),
  theirs: graphWithTriggers(
    { b: triggered('Theirs B.', ['g0']), l0: triggered('Base.', ['g0']) },
    { g0: glob('src/a.ts') },
  ),
};

const SHARED_TRIGGERS = { g0: glob('src/a.ts'), g1: glob('src/b.ts') };
const shared = (over: Partial<Lesson>): Lesson => ({
  ...triggered('Base.', ['g0', 'g1']),
  ...over,
});

/**
 * Both branches only edit the lesson they share: this branch adds evidence, the
 * incoming branch rewords the rule on the next line (a line conflict). The merge
 * result holds no new lesson id, so only its content differs from this branch.
 */
export const EDIT_ONLY_CAPTURES = {
  base: graphWithTriggers({ l0: shared({}) }, SHARED_TRIGGERS),
  ours: graphWithTriggers({ l0: shared({ evidence: ['ev1'] }) }, SHARED_TRIGGERS),
  theirs: graphWithTriggers({ l0: shared({ rule: 'Reworded.' }) }, SHARED_TRIGGERS),
};
