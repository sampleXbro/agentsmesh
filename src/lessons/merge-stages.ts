import { existsSync, readFileSync } from 'node:fs';
import { hasConflictMarkers, splitConflictSides } from './conflict-markers.js';
import { runGit } from './git-exec.js';
import { graphFilePath, LESSONS_GRAPH_PATH } from './graph-store.js';

/**
 * The base / ours / theirs texts of lessons.json during an unfinished git
 * merge: from the index stages, or rebuilt from the conflict markers in the
 * file. Used by `lessons resolve` and by the unmerged-graph check.
 */

export interface ConflictTexts {
  readonly source: 'index' | 'markers';
  readonly base: string | null;
  readonly ours: string | null;
  readonly theirs: string | null;
}

/**
 * Index stages 1-3 (a missing stage means absent on that side); null when git
 * does not hold the graph unmerged or this is not a git work tree. Runs git in
 * the project root, so a project in a subdirectory of the repository works.
 */
export function readIndexStages(projectRoot: string): ConflictTexts | null {
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

/** Both sides rebuilt from the file's conflict markers; null when it has none. */
export function readMarkerSides(projectRoot: string): ConflictTexts | null {
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
