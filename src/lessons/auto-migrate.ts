import { todayIso } from './add-helpers.js';
import { existsSync } from 'node:fs';
import { graphFilePath } from './graph-store.js';
import { importLegacyLessons, LessonsGraphExistsError } from './import-legacy.js';
import { lessonsPaths } from './paths.js';

/**
 * One-shot legacy→JSON migration on first access. Shared by the CLI dispatcher
 * AND the MCP handlers so that an MCP-only agent (query/add) does not strand a
 * legacy store: if it added first it would create `lessons.json`, which then
 * permanently blocks the absent-graph auto-migration. Returns true if it
 * migrated. No-op when a graph already exists or no legacy index is present.
 * The unlocked checks are a fast path; `requireAbsentGraph` repeats the graph
 * check under the lessons lock before the legacy store is read.
 */
export async function maybeAutoMigrateLessons(projectRoot: string): Promise<boolean> {
  if (existsSync(graphFilePath(projectRoot))) return false;
  const paths = lessonsPaths(projectRoot);
  if (!existsSync(paths.index)) return false;
  try {
    await importLegacyLessons(projectRoot, { migratedAt: todayIso(), requireAbsentGraph: true });
    return true;
  } catch (err) {
    // Another writer created the graph (even an empty one) before we got the
    // lock — migration refused rather than clobber it. Not an error here.
    if (err instanceof LessonsGraphExistsError) return false;
    throw err;
  }
}
