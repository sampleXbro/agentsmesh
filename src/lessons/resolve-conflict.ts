import { LESSONS_GRAPH_PATH, saveLessonsGraph } from './graph-store.js';
import { acquireLessonsLock, LessonsLockLostError } from './lessons-lock.js';
import { readIndexStages, readMarkerSides, type ConflictTexts } from './merge-stages.js';
import { describeUnreadableSide, unionGraphTexts, type MergedSides } from './merge-sides.js';

/**
 * `agentsmesh lessons resolve`: finish a git merge that left lessons.json
 * conflicted (the merge driver was not configured, or it could not run). The
 * three versions come from the index stages; when those are gone (the markers
 * were committed, or the merge was aborted by hand) or a stage cannot be read
 * (the user fixes that side in the file), they are rebuilt from the conflict
 * markers. The same union the merge driver uses then replaces the file.
 */

interface ResolvedConflict {
  readonly source: ConflictTexts['source'];
  readonly lessonCount: number;
  readonly onlyOurs: number;
  readonly onlyTheirs: number;
  readonly introduced: readonly string[];
}

type ResolveOutcome =
  | { readonly ok: true; readonly resolved: ResolvedConflict }
  | { readonly ok: false; readonly error: string };

type Combined =
  | { readonly ok: true; readonly source: ConflictTexts['source']; readonly union: MergedSides }
  | { readonly ok: false; readonly error: string };

const FIX_BY_HAND = ' Fix that side by hand, keeping the lessons from both branches.';
const FIX_IN_FILE =
  ` Fix it in ${LESSONS_GRAPH_PATH} (its conflict markers hold both sides), then run ` +
  '`agentsmesh lessons resolve` again.';

function summarize(source: ConflictTexts['source'], union: MergedSides): ResolvedConflict {
  const ours = Object.keys(union.sides.ours.lessons);
  const theirs = Object.keys(union.sides.theirs.lessons);
  return {
    source,
    lessonCount: Object.keys(union.merged.lessons).length,
    onlyOurs: ours.filter((id) => !theirs.includes(id)).length,
    onlyTheirs: theirs.filter((id) => !ours.includes(id)).length,
    introduced: union.introduced,
  };
}

const unionOf = (t: ConflictTexts): ReturnType<typeof unionGraphTexts> =>
  unionGraphTexts(t.base, t.ours, t.theirs);

function combineSides(projectRoot: string): Combined {
  const index = readIndexStages(projectRoot);
  const union = index === null ? null : unionOf(index);
  if (union?.ok === true) return { ok: true, source: 'index', union };
  // A newer schema is not fixed by hand; any other unreadable stage can be, in the file.
  const markers = union?.newerVersion === undefined ? readMarkerSides(projectRoot) : null;
  const fromMarkers = markers === null ? null : unionOf(markers);
  if (fromMarkers?.ok === true) return { ok: true, source: 'markers', union: fromMarkers };
  const failure = union ?? fromMarkers;
  if (failure === null) {
    return {
      ok: false,
      error: `Nothing to resolve: ${LESSONS_GRAPH_PATH} is not in a merge conflict (no unmerged git entry and no conflict markers).`,
    };
  }
  const next =
    failure.newerVersion !== undefined ? '' : markers === null ? FIX_BY_HAND : FIX_IN_FILE;
  return { ok: false, error: `Cannot resolve: ${describeUnreadableSide(failure)}${next}` };
}

export async function resolveLessonsConflict(projectRoot: string): Promise<ResolveOutcome> {
  let combined: Combined;
  try {
    combined = combineSides(projectRoot);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!combined.ok) return combined;
  // The current file is unreadable by design, so the normal load-validate-write
  // transaction cannot run; take the same lock and write atomically instead.
  const release = await acquireLessonsLock(projectRoot);
  try {
    // A holder paused past the stale window may have been evicted: never save over the next writer.
    if (!(await release.isHeld())) return { ok: false, error: new LessonsLockLostError().message };
    saveLessonsGraph(projectRoot, combined.union.merged);
  } finally {
    await release();
  }
  return { ok: true, resolved: summarize(combined.source, combined.union) };
}
