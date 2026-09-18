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
 */
export async function maybeAutoMigrateLessons(projectRoot: string): Promise<boolean> {
  if (existsSync(graphFilePath(projectRoot))) return false;
  const paths = lessonsPaths(projectRoot);
  if (!existsSync(paths.index)) return false;
  try {
    await importLegacyLessons(projectRoot, { migratedAt: todayIso() });
    return true;
  } catch (err) {
    // A concurrent writer created the graph between our check and the lock —
    // migration refused (correctly) rather than clobber it. Not an error here.
    if (err instanceof LessonsGraphExistsError) return false;
    throw err;
  }
}
