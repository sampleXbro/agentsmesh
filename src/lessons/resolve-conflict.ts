import { existsSync, readFileSync } from 'node:fs';
import { hasConflictMarkers, splitConflictSides } from './conflict-markers.js';
import { runGit } from './git-exec.js';
import { graphFilePath, saveLessonsGraph } from './graph-store.js';
import { acquireLessonsLock } from './lessons-lock.js';
import {
  LESSONS_GRAPH_PATH,
  describeUnreadableSide,
  unionGraphTexts,
  type MergedSides,
} from './merge-sides.js';

/**
 * `agentsmesh lessons resolve`: finish a git merge that left lessons.json
 * conflicted (the merge driver was not configured, or it could not run). The
 * three versions come from the index stages; when those are gone (the markers
 * were committed, or the merge was aborted by hand) they are rebuilt from the
 * conflict markers. The same union the merge driver uses then replaces the file.
 */

export interface ResolvedConflict {
  readonly source: 'index' | 'markers';
  readonly lessonCount: number;
  readonly onlyOurs: number;
  readonly onlyTheirs: number;
  readonly introduced: readonly string[];
}

export type ResolveOutcome =
  | { readonly ok: true; readonly resolved: ResolvedConflict }
  | { readonly ok: false; readonly error: string };

interface ConflictTexts {
  readonly source: ResolvedConflict['source'];
  readonly base: string | null;
  readonly ours: string | null;
  readonly theirs: string | null;
}

/** Base / ours / theirs from index stages 1-3 (a missing stage means absent on that side). */
function readIndexStages(projectRoot: string): ConflictTexts | null {
  const ls = runGit(projectRoot, ['ls-files', '-u', '--', LESSONS_GRAPH_PATH]);
  if (ls.status !== 0) return null;
  const blobs = new Map<string, string>();
  for (const line of ls.stdout.split('\n')) {
    const m = /^\d+ ([0-9a-f]+) ([123])\t/.exec(line);
    if (m !== null) blobs.set(m[2]!, m[1]!);
  }
  if (blobs.size === 0) return null;
  const read = (stage: string): string | null => {
    const sha = blobs.get(stage);
    if (sha === undefined) return null;
    const blob = runGit(projectRoot, ['cat-file', 'blob', sha]);
    if (blob.status !== 0)
      throw new Error(`git could not read merge stage ${stage}: ${blob.stderr.trim()}`);
    return blob.stdout;
  };
  return { source: 'index', base: read('1'), ours: read('2'), theirs: read('3') };
}

function readMarkerSides(projectRoot: string): ConflictTexts | null {
  const path = graphFilePath(projectRoot);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  if (!hasConflictMarkers(text)) return null;
  const sides = splitConflictSides(text);
  if (sides === null) {
    throw new Error(
      `${LESSONS_GRAPH_PATH} has conflict markers, but they are incomplete, so the two sides ` +
        'cannot be rebuilt. Resolve it by hand, keeping the lessons from both branches.',
    );
  }
  return { source: 'markers', ...sides };
}

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

export async function resolveLessonsConflict(projectRoot: string): Promise<ResolveOutcome> {
  let texts: ConflictTexts | null;
  try {
    texts = readIndexStages(projectRoot) ?? readMarkerSides(projectRoot);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (texts === null) {
    return {
      ok: false,
      error: `Nothing to resolve: ${LESSONS_GRAPH_PATH} is not in a merge conflict (no unmerged git entry and no conflict markers).`,
    };
  }
  const union = unionGraphTexts(texts.base, texts.ours, texts.theirs);
  if (!union.ok) {
    const next =
      union.newerVersion === undefined
        ? ' Fix that side by hand, keeping the lessons from both branches.'
        : '';
    return { ok: false, error: `Cannot resolve: ${describeUnreadableSide(union)}${next}` };
  }
  // The current file is unreadable by design, so the normal load-validate-write
  // transaction cannot run; take the same lock and write atomically instead.
  const release = await acquireLessonsLock(projectRoot);
  try {
    saveLessonsGraph(projectRoot, union.merged);
  } finally {
    await release();
  }
  return { ok: true, resolved: summarize(texts.source, union) };
}
