import { createActionMatcher, type ActionMatcher } from './action-match.js';
import type { Lesson, LessonsGraph } from './graph-schema.js';
import type { OutcomeDelivered, OutcomeEvent } from './outcome-log.js';

/**
 * Did a delivered lesson prevent the repeat? Derived from the outcome log.
 *
 * A delivery is a MISS only when a failure follows it in the SAME session,
 * within {@link MISS_WINDOW_MS}, on an action that re-matches one of THAT
 * lesson's own triggers. Sessionless events are never attributed. This feeds
 * three views that must agree: recall ranking ({@link effectivenessScores}),
 * `validate` (INEFFECTIVE_LESSON) and `stats` (held rate). Still a coarse
 * signal — no miss is not proof the lesson prevented anything.
 */

/** Deliveries needed before a lesson is judged ineffective or down-ranked. */
export const INEFFECTIVE_MIN_DELIVERIES = 3;
/** A failure later than this after a delivery is not attributed to it. */
export const MISS_WINDOW_MS = 30 * 60 * 1000;

interface LessonOutcome {
  readonly delivered: number;
  readonly missed: number;
  /** Distinct failing actions (context keys) behind `missed`, sorted. */
  readonly failingActions: readonly string[];
}

interface TimedFailure {
  readonly index: number;
  readonly at: number;
  readonly contextKey: string;
}

function failuresBySession(events: readonly OutcomeEvent[]): Map<string, TimedFailure[]> {
  const out = new Map<string, TimedFailure[]>();
  events.forEach((ev, index) => {
    const at = Date.parse(ev.ts);
    if (ev.kind !== 'failure' || ev.session === undefined || !Number.isFinite(at)) return;
    const list = out.get(ev.session) ?? [];
    list.push({ index, at, contextKey: ev.contextKey });
    out.set(ev.session, list);
  });
  return out;
}

function impeachingFailure(
  ev: OutcomeDelivered,
  index: number,
  failures: ReadonlyMap<string, readonly TimedFailure[]>,
  matches: ActionMatcher,
): TimedFailure | undefined {
  const at = Date.parse(ev.ts);
  if (ev.session === undefined || !Number.isFinite(at)) return undefined;
  return failures
    .get(ev.session)
    ?.find(
      (f) =>
        f.index > index &&
        f.at >= at &&
        f.at - at <= MISS_WINDOW_MS &&
        matches(ev.lessonId, f.contextKey),
    );
}

/** Per-lesson delivered/missed tallies. Pure and deterministic. */
export function effectiveness(
  events: readonly OutcomeEvent[],
  graph: LessonsGraph,
): Map<string, LessonOutcome> {
  const failures = failuresBySession(events);
  const matches = createActionMatcher(graph);
  const acc = new Map<string, { delivered: number; missed: number; actions: Set<string> }>();
  events.forEach((ev, index) => {
    if (ev.kind !== 'delivered') return;
    const cur = acc.get(ev.lessonId) ?? { delivered: 0, missed: 0, actions: new Set<string>() };
    acc.set(ev.lessonId, cur);
    cur.delivered += 1;
    const hit = impeachingFailure(ev, index, failures, matches);
    if (hit === undefined) return;
    cur.missed += 1;
    cur.actions.add(hit.contextKey);
  });
  const out = new Map<string, LessonOutcome>();
  for (const [id, a] of acc) {
    out.set(id, {
      delivered: a.delivered,
      missed: a.missed,
      failingActions: [...a.actions].sort(),
    });
  }
  return out;
}

/** 1 = always helped, 0 = never helped. Undelivered lessons are neutral (1). */
export function effectivenessScore(o: Pick<LessonOutcome, 'delivered' | 'missed'>): number {
  return o.delivered === 0 ? 1 : 1 - o.missed / o.delivered;
}

/** Delivered enough to judge, missed every time, and still active. */
export function isIneffective(o: LessonOutcome, lesson: Lesson | undefined): boolean {
  return (
    o.delivered >= INEFFECTIVE_MIN_DELIVERIES &&
    o.missed === o.delivered &&
    lesson?.status === 'active'
  );
}

/**
 * Ranking scores in [0,1] for lessons delivered at least
 * {@link INEFFECTIVE_MIN_DELIVERIES} times; thinner samples are absent (neutral),
 * so ranking never acts on less evidence than `validate` needs to judge.
 */
export function effectivenessScores(
  events: readonly OutcomeEvent[],
  graph: LessonsGraph,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, o] of effectiveness(events, graph)) {
    if (o.delivered >= INEFFECTIVE_MIN_DELIVERIES) out.set(id, effectivenessScore(o));
  }
  return out;
}
