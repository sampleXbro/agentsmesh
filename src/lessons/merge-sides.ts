import { stripBom } from '../utils/filesystem/fs-text-encoding.js';
import { CURRENT_GRAPH_VERSION, LessonsGraphSchema, type LessonsGraph } from './graph-schema.js';
import { LESSONS_GRAPH_PATH, stableStringify } from './graph-store.js';
import { mergeGraphs, renameIdCollisions } from './merge-graph.js';
import { validateLessonsGraph } from './validate.js';

/**
 * Parse the base / ours / theirs texts of lessons.json and union them. Shared
 * by the git merge driver and `lessons resolve` so both merge the same way and
 * explain an unreadable side the same way.
 */

type SideName = 'ours' | 'theirs';

const SIDE_LABEL: Record<SideName, string> = {
  ours: 'this branch',
  theirs: 'the incoming branch',
};

type ParsedSide =
  | { readonly ok: true; readonly graph: LessonsGraph }
  | { readonly ok: false; readonly detail: string; readonly newerVersion?: number };

interface UnreadableSide {
  readonly ok: false;
  readonly side: SideName;
  readonly detail: string;
  readonly newerVersion?: number;
}

export interface MergedSides {
  readonly ok: true;
  readonly merged: LessonsGraph;
  readonly sides: Readonly<Record<SideName, LessonsGraph>>;
  /** Each side's lesson ids after same-id lessons were renamed apart. */
  readonly lessonIds: Readonly<Record<SideName, readonly string[]>>;
  readonly introduced: readonly string[];
  /** Why a non-empty base was read as an empty graph; unset when it was fine, blank or absent. */
  readonly baseUnreadable?: string;
}

type SidesUnion = MergedSides | UnreadableSide;

const absentGraph = (): LessonsGraph => ({ version: 1, lessons: {}, topics: {}, triggers: {} });

export function parseGraphText(text: string): ParsedSide {
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(text));
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
  const version = (raw as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version > CURRENT_GRAPH_VERSION) {
    return { ok: false, detail: `schema version ${version}`, newerVersion: version };
  }
  const parsed = LessonsGraphSchema.safeParse(raw);
  if (parsed.success) return { ok: true, graph: parsed.data };
  const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { ok: false, detail };
}

function errorKeys(graph: LessonsGraph): Set<string> {
  const keys = new Set<string>();
  for (const f of validateLessonsGraph(graph).findings) {
    if (f.level === 'error') keys.add(`${f.code}: ${f.message}`);
  }
  return keys;
}

/**
 * Union three texts of the graph. `null` means the file is absent on that side;
 * a blank base is an empty graph (git passes an empty ancestor when both
 * branches created the file). A base that is present but unreadable is also read
 * as empty, so a deletion one branch made cannot be seen: `baseUnreadable` says
 * why. `introduced` lists validation errors the merge created that neither side
 * already had.
 */
export function unionGraphTexts(
  base: string | null,
  ours: string | null,
  theirs: string | null,
): SidesUnion {
  const sides: Record<SideName, LessonsGraph> = { ours: absentGraph(), theirs: absentGraph() };
  for (const [side, text] of [
    ['ours', ours],
    ['theirs', theirs],
  ] as const) {
    if (text === null) continue;
    const parsed = parseGraphText(text);
    if (!parsed.ok) return { ...parsed, side };
    sides[side] = parsed.graph;
  }
  const parsedBase = base === null || base.trim() === '' ? null : parseGraphText(base);
  const baseGraph = parsedBase?.ok === true ? parsedBase.graph : absentGraph();
  const merged = mergeGraphs(baseGraph, sides.ours, sides.theirs);
  const preExisting = new Set([...errorKeys(sides.ours), ...errorKeys(sides.theirs)]);
  const introduced = [...errorKeys(merged)].filter((k) => !preExisting.has(k));
  const [o, t] = renameIdCollisions(baseGraph.lessons, sides.ours.lessons, sides.theirs.lessons);
  const lessonIds = { ours: Object.keys(o), theirs: Object.keys(t) };
  const baseUnreadable = parsedBase?.ok === false ? { baseUnreadable: parsedBase.detail } : {};
  return { ok: true, merged, sides, lessonIds, introduced, ...baseUnreadable };
}

/** Ids of the merged lessons (after same-id lessons were renamed apart) that `graph` lacks. */
function missingLessonIds(union: MergedSides, graph: LessonsGraph): string[] {
  return Object.keys(union.merged.lessons).filter((id) => graph.lessons[id] === undefined);
}

const sameGraph = (a: LessonsGraph, b: LessonsGraph): boolean =>
  stableStringify(a) === stableStringify(b);

/**
 * True when `graph`, the file that should hold the merge result, does not:
 * - it lacks a merged lesson (by id); or
 * - it is still exactly this branch's graph while the merge changed it. That is
 *   what git leaves when the driver could not start: it keeps %A as it was, so
 *   an edit the other branch made to a lesson both have would be dropped.
 * A graph repaired after a real union (`untrigger`, `prune`) differs from this
 * branch and holds every lesson, so an edited lesson is never counted as lost.
 */
export function missesMergeResult(union: MergedSides, graph: LessonsGraph): boolean {
  if (missingLessonIds(union, graph).length > 0) return true;
  const ours = union.sides.ours;
  return sameGraph(graph, ours) && !sameGraph(union.merged, ours);
}

/** One sentence for a base that could not be read; the caller adds its own prefix. */
export function describeUnreadableBase(detail: string): string {
  return (
    `The common ancestor of ${LESSONS_GRAPH_PATH} could not be read (${detail}), so it was ` +
    'treated as empty. Both branches were combined and no lesson was lost, but a trigger or ' +
    'topic that one branch deleted may be back. Check with `agentsmesh lessons validate`.'
  );
}

/** One sentence naming lessons.json, the side, and why it cannot be merged. */
export function describeUnreadableSide(failure: UnreadableSide): string {
  const where = `${LESSONS_GRAPH_PATH} on ${SIDE_LABEL[failure.side]}`;
  if (failure.newerVersion !== undefined) {
    return (
      `${where} uses lessons schema version ${failure.newerVersion}, newer than this ` +
      `agentsmesh supports (${CURRENT_GRAPH_VERSION}). Upgrade agentsmesh, then run ` +
      '`agentsmesh lessons resolve`.'
    );
  }
  return `${where} is not a valid lessons graph (${failure.detail}), so the two sides cannot be combined automatically.`;
}
