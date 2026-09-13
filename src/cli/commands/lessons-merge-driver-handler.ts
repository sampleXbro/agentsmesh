import { readFileSync, writeFileSync } from 'node:fs';
import {
  CURRENT_GRAPH_VERSION,
  LessonsGraphSchema,
  type LessonsGraph,
} from '../../lessons/graph-schema.js';
import { serializeGraph } from '../../lessons/graph-store.js';
import { mergeGraphs } from '../../lessons/merge-graph.js';
import { validateLessonsGraph } from '../../lessons/validate.js';
import type { LessonsCommandResult } from './lessons-types.js';

function readGraphFile(path: string): LessonsGraph | null {
  try {
    const parsed = LessonsGraphSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function emptyGraph(): LessonsGraph {
  return { version: CURRENT_GRAPH_VERSION, lessons: {}, topics: {}, triggers: {} };
}

function errorKeys(graph: LessonsGraph): Set<string> {
  const keys = new Set<string>();
  for (const f of validateLessonsGraph(graph).findings) {
    if (f.level === 'error') keys.add(`${f.code}:${f.message}`);
  }
  return keys;
}

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

  const ours = readGraphFile(oursPath);
  const theirs = readGraphFile(theirsPath);
  if (ours === null || theirs === null) {
    const side = ours === null ? 'this branch' : 'the incoming branch';
    return result(
      1,
      false,
      `lessons merge-driver: the lessons graph on ${side} is not readable, so the two sides ` +
        `cannot be combined. "${oursPath}" was left untouched — resolve it by hand, keeping the ` +
        'lessons from both branches.',
    );
  }

  const merged = mergeGraphs(readGraphFile(basePath) ?? emptyGraph(), ours, theirs);
  const preExisting = errorKeys(ours);
  for (const key of errorKeys(theirs)) preExisting.add(key);
  const introduced = validateLessonsGraph(merged).findings.filter(
    (f) => f.level === 'error' && !preExisting.has(`${f.code}:${f.message}`),
  );

  writeFileSync(oursPath, serializeGraph(merged), 'utf8');
  if (introduced.length > 0) {
    const errors = introduced.map((f) => `${f.code}: ${f.message}`).join('; ');
    return result(
      1,
      true,
      `lessons merge-driver: combined both branches into "${oursPath}", but the result ` +
        `introduces ${errors}. Nothing was discarded — review with \`agentsmesh lessons validate\` ` +
        'and repair with `lessons untrigger` / `lessons prune` before staging.',
    );
  }
  return result(0, true);
}
