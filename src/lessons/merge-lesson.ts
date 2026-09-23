import type { Lesson, LessonStatus } from './graph-schema.js';
import { stableStringify } from './graph-store.js';

/**
 * Field-by-field three-way merge of ONE lesson edited on both branches.
 * Lists (triggers, topics, evidence) are merged as sets against the base, so
 * an item added on either side survives and an item removed on one side (while
 * the other kept it) stays removed. Retirement beats `active` on a real
 * conflict. Only scalar fields fall back to a deterministic tiebreak.
 */

const same = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);

/** Three-way set merge; output order does not depend on which side is "ours". */
export function mergeList(
  base: readonly string[] | undefined,
  ours: readonly string[],
  theirs: readonly string[],
): string[] {
  const b = new Set(base ?? []);
  const o = new Set(ours);
  const t = new Set(theirs);
  const keep = (x: string): boolean =>
    (o.has(x) && t.has(x)) || (o.has(x) !== t.has(x) && !b.has(x));
  const [first, second] =
    stableStringify(ours) <= stableStringify(theirs) ? [ours, theirs] : [theirs, ours];
  const out: string[] = [];
  for (const x of [...(base ?? []), ...first, ...second]) {
    if (!out.includes(x) && keep(x)) out.push(x);
  }
  return out;
}

/** Three-way scalar merge; `tiebreak` decides only when both sides changed it differently. */
function mergeScalar<T>(
  hasBase: boolean,
  base: T,
  ours: T,
  theirs: T,
  tiebreak: (a: T, b: T) => T,
): T {
  if (same(ours, theirs)) return ours;
  if (hasBase && same(ours, base)) return theirs;
  if (hasBase && same(theirs, base)) return ours;
  return tiebreak(ours, theirs);
}

/** Prefer a present value; otherwise pick by content so the result is side-order independent. */
function preferDefined<T>(a: T | undefined, b: T | undefined): T | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

const earliest = (a: string, b: string): string => (a <= b ? a : b);

const STATUS_RANK: Record<LessonStatus, number> = { active: 0, deprecated: 1, superseded: 2 };
const higherStatus = (a: LessonStatus, b: LessonStatus): LessonStatus =>
  STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;

/** Merge status + supersededBy together: the successor follows the side(s) whose status won. */
function mergeLifecycle(
  base: Lesson | undefined,
  ours: Lesson,
  theirs: Lesson,
): Pick<Lesson, 'status' | 'supersededBy'> {
  const status = mergeScalar(base !== undefined, base?.status, ours.status, theirs.status, (a, b) =>
    higherStatus(a!, b!),
  )!;
  const sides = [ours, theirs].filter((l) => l.status === status);
  const supersededBy =
    sides.length === 2
      ? mergeScalar(
          base !== undefined,
          base?.supersededBy,
          ours.supersededBy,
          theirs.supersededBy,
          preferDefined,
        )
      : sides[0]!.supersededBy;
  return supersededBy === undefined ? { status } : { status, supersededBy };
}

export function mergeLesson(base: Lesson | undefined, ours: Lesson, theirs: Lesson): Lesson {
  if (same(ours, theirs)) return ours;
  if (base !== undefined && same(ours, base)) return theirs;
  if (base !== undefined && same(theirs, base)) return ours;
  const hasBase = base !== undefined;
  const pick = <K extends 'rule' | 'rationale' | 'scope'>(key: K): Lesson[K] | undefined =>
    mergeScalar(hasBase, base?.[key], ours[key], theirs[key], preferDefined);
  const topics = mergeList(base?.topics, ours.topics, theirs.topics);
  const merged: Lesson = {
    rule: pick('rule')!,
    // Each side removing a different topic could leave none; the schema needs one.
    topics: topics.length > 0 ? topics : mergeList(undefined, ours.topics, theirs.topics),
    triggers: mergeList(base?.triggers, ours.triggers, theirs.triggers),
    evidence: mergeList(base?.evidence, ours.evidence, theirs.evidence),
    createdAt: mergeScalar(hasBase, base?.createdAt, ours.createdAt, theirs.createdAt, (a, b) =>
      earliest(a!, b!),
    )!,
    ...mergeLifecycle(base, ours, theirs),
  };
  // A rationale is never deliberately removed, so one present on either side is kept.
  const rationale = pick('rationale') ?? preferDefined(ours.rationale, theirs.rationale);
  if (rationale !== undefined) merged.rationale = rationale;
  const scope = pick('scope');
  if (scope !== undefined) merged.scope = scope;
  return merged;
}
