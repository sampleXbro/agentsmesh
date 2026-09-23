import { normalizeRule, union } from './add-helpers.js';
import type { Lesson, LessonsGraph } from './graph-schema.js';
import { stableStringify } from './graph-store.js';
import { mergeLesson, mergeScalar } from './merge-lesson.js';

/**
 * Three-way union merge of the lessons graph — the engine behind the git merge
 * driver and `lessons resolve`. `lessons.json` is a single file, so two branches
 * that each capture a lesson collide in git's line-based merge even though the
 * changes are logically independent. This merges the lessons / topics / triggers
 * maps by key instead: the common case (each branch adds new entries) unions
 * cleanly, and a lesson edited on both branches is merged field by field
 * (see merge-lesson.ts).
 *
 * Bias: never drop an entry that exists on either side. For a failure-memory
 * graph, keeping a stale lesson is safer than silently losing a captured one.
 */

type Rec<T> = Record<string, T>;
type Lessons = Rec<Lesson>;
type ListField = 'triggers' | 'topics' | 'evidence';

/** Three-way pick of a whole record; a deterministic, side-order-independent tiebreak. */
function pick<T>(base: T | undefined, ours: T, theirs: T): T {
  return mergeScalar<T | undefined>(base !== undefined, base, ours, theirs, (a, b) =>
    stableStringify(a) > stableStringify(b) ? a : b,
  ) as T;
}

function mergeRecord<T>(
  base: Rec<T>,
  ours: Rec<T>,
  theirs: Rec<T>,
  merge: (b: T | undefined, o: T, t: T) => T = pick,
): Rec<T> {
  const out: Rec<T> = {};
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const o = ours[k];
    const t = theirs[k];
    out[k] = o !== undefined && t !== undefined ? merge(base[k], o, t) : (o ?? t)!;
  }
  return out;
}

/**
 * One side superseded a lesson (e.g. `lessons merge`) while the other side,
 * still seeing it active, added triggers/topics/evidence. Retirement wins, so
 * move those additions to the successor or that coverage would silently vanish.
 */
function carryToSuccessor(base: Lessons, sides: readonly Lessons[], merged: Lessons): void {
  for (const [id, lesson] of Object.entries(merged)) {
    const successorId = lesson.supersededBy;
    if (lesson.status !== 'superseded' || successorId === undefined) continue;
    for (const side of sides) {
      const edited = side[id];
      const successor = merged[successorId];
      if (edited?.status !== 'active' || successor === undefined) continue;
      const added = (field: ListField): string[] =>
        edited[field].filter((x) => !(base[id]?.[field] ?? []).includes(x));
      merged[successorId] = {
        ...successor,
        triggers: union(successor.triggers, added('triggers')),
        topics: union(successor.topics, added('topics')),
        evidence: union(successor.evidence, added('evidence')),
      };
    }
  }
}

/** True when one id holds two DIFFERENT rules and neither is the base's rule. */
function isDistinctEntity(base: Lesson | undefined, ours: Lesson, theirs: Lesson): boolean {
  const o = normalizeRule(ours.rule);
  const t = normalizeRule(theirs.rule);
  if (o === t) return false;
  if (base === undefined) return true;
  const b = normalizeRule(base.rule);
  return o !== b && t !== b;
}

function freeKey(k: string, taken: ReadonlySet<string>): string {
  let i = 2;
  while (taken.has(`${k}-${i}`)) i += 1;
  return `${k}-${i}`;
}

/** Apply `renames` to one side's keys, remapping same-side `supersededBy` chains. */
function rekey(side: Lessons, renames: ReadonlyMap<string, string>): Lessons {
  if (renames.size === 0) return side;
  const out: Lessons = {};
  for (const [k, l] of Object.entries(side)) {
    const by = l.supersededBy === undefined ? undefined : renames.get(l.supersededBy);
    out[renames.get(k) ?? k] = by === undefined ? l : { ...l, supersededBy: by };
  }
  return out;
}

/**
 * Lesson ids derive from topic + leading rule words and are disambiguated only
 * against the LOCAL graph, so two branches can mint the same id for different
 * rules. Treating that key as one entity would silently drop a captured lesson,
 * so the side `pick` would discard is re-keyed to `<id>-2`, `-3`, … before the
 * union. Nothing else references lesson ids except `supersededBy`, which is
 * remapped on the same side.
 */
function resolveIdCollisions(base: Lessons, ours: Lessons, theirs: Lessons): [Lessons, Lessons] {
  const taken = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const oursRenames = new Map<string, string>();
  const theirsRenames = new Map<string, string>();
  for (const k of Object.keys(ours).sort()) {
    const o = ours[k];
    const t = theirs[k];
    if (o === undefined || t === undefined || !isDistinctEntity(base[k], o, t)) continue;
    const fresh = freeKey(k, taken);
    taken.add(fresh);
    (pick(base[k], o, t) === o ? theirsRenames : oursRenames).set(k, fresh);
  }
  return [rekey(ours, oursRenames), rekey(theirs, theirsRenames)];
}

export function mergeGraphs(
  base: LessonsGraph,
  ours: LessonsGraph,
  theirs: LessonsGraph,
): LessonsGraph {
  const [o, t] = resolveIdCollisions(base.lessons, ours.lessons, theirs.lessons);
  const lessons = mergeRecord(base.lessons, o, t, mergeLesson);
  carryToSuccessor(base.lessons, [o, t], lessons);
  return {
    version: ours.version >= theirs.version ? ours.version : theirs.version,
    lessons,
    topics: mergeRecord(base.topics, ours.topics, theirs.topics),
    triggers: mergeRecord(base.triggers, ours.triggers, theirs.triggers),
  };
}
