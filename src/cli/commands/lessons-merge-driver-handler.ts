import { writeFileSync } from 'node:fs';
import { LESSONS_GRAPH_PATH, serializeGraph } from '../../lessons/graph-store.js';
import { describeUnreadableSide, unionGraphTexts } from '../../lessons/merge-sides.js';
import { writeTextualMerge } from '../../lessons/textual-merge.js';
import { readTextOrEmpty as readText } from '../../utils/filesystem/fs.js';
import type { LessonsCommandResult } from './lessons-types.js';

function result(exitCode: 0 | 1, merged: boolean, error?: string): LessonsCommandResult {
  return { subcommand: 'merge-driver', exitCode, data: { merged }, ...(error ? { error } : {}) };
}

/**
 * Git merge driver for `.agentsmesh/lessons/lessons.json` (internal — invoked by
 * git, not a human). Args are the three file paths git passes: base (ancestor),
 * ours (also the OUTPUT target), theirs.
 *
 * A failing driver does NOT make git re-merge the file with conflict markers:
 * git leaves `ours` exactly as it found it and marks the path unmerged, so
 * every lesson captured on the other branch is silently discarded the moment
 * someone runs `git add`. The driver therefore writes the three-way union
 * whenever it can build one — losing a branch's captured rules is worse than
 * persisting a graph `agentsmesh lessons validate` can repair — and reserves a
 * non-zero exit for "a human must look at this", never for "throw work away".
 * When a side cannot be read at all (corrupt, or a newer schema), it writes
 * git's textual merge with conflict markers instead, so both sides stay in the
 * file for `agentsmesh lessons resolve` or a human.
 *
 * Two inputs are tolerated rather than treated as failures:
 * - An empty or unparsable base. Git passes an empty ancestor when the file is
 *   new on both branches, which is the common first-capture race.
 * - Validation errors that already exist on any side. Only errors the merge
 *   itself introduces are worth a human's attention (same rule `mutateLessonsGraph`
 *   applies to captures).
 */
export function doMergeDriver(args: readonly string[]): LessonsCommandResult {
  const [basePath, oursPath, theirsPath] = args;
  if (basePath === undefined || oursPath === undefined || theirsPath === undefined) {
    return result(1, false, 'lessons merge-driver: expected base, ours and theirs paths.');
  }

  const union = unionGraphTexts(readText(basePath), readText(oursPath), readText(theirsPath));
  if (!union.ok) {
    writeTextualMerge(basePath, oursPath, theirsPath);
    const next =
      union.newerVersion === undefined
        ? ' Resolve the conflict markers by hand, keeping the lessons from both branches.'
        : '';
    return result(
      1,
      false,
      `lessons merge-driver: ${describeUnreadableSide(union)} Both sides were written into ` +
        `${LESSONS_GRAPH_PATH} as a line merge, with conflict markers where they clash, so no ` +
        `lesson is lost.${next}`,
    );
  }

  writeFileSync(oursPath, serializeGraph(union.merged), 'utf8');
  if (union.introduced.length > 0) {
    return result(
      1,
      true,
      `lessons merge-driver: combined both branches into ${LESSONS_GRAPH_PATH}, but the result ` +
        `introduces ${union.introduced.join('; ')}. Nothing was discarded — review with ` +
        '`agentsmesh lessons validate` and repair with `lessons untrigger` / `lessons prune` ' +
        'before staging.',
    );
  }
  return result(0, true);
}
