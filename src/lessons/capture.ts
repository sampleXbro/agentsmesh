import {
  addLesson,
  type AddLessonInput,
  type AddLessonOptions,
  type AddLessonResult,
} from './add.js';
import { maybeAutoMigrateLessons } from './auto-migrate.js';
import { maybeAutoPrune } from './auto-prune.js';
import { recordCapture } from './capture-telemetry.js';
import { listProjectFiles } from './project-files.js';

/**
 * Capture primitive for applications: migrate if needed, then add the lesson
 * through the transactional write path. Idempotent on repeat (same rule+topic).
 * The symmetric counterpart of `recallLessons` (recall.ts), split out for the
 * 200-line limit.
 *
 * Both CLI `lessons add` and MCP `lessons_add` route through here, so capture
 * telemetry is recorded once at this single entry point (mirroring how every
 * recall records through `recallLessons`). Every rejection — a dead trigger, an
 * unknown topic, a write-barrier failure — is recorded as a BLOCKED capture
 * before being rethrown, so `stats` never undercounts blocks.
 */
export async function captureLesson(
  projectRoot: string,
  input: AddLessonInput,
  options: AddLessonOptions = {},
): Promise<AddLessonResult> {
  await maybeAutoMigrateLessons(projectRoot);
  const triggerKinds = {
    file: input.triggers.files?.length ?? 0,
    command: input.triggers.commands?.length ?? 0,
    keyword: input.triggers.keywords?.length ?? 0,
  };
  // Supply the working-tree file list so capture can warn on a dead glob (a typo
  // or stale path) at the best moment to fix it. null (no walk possible) → the
  // DEAD_GLOB check is skipped, never a false positive. Caller-provided
  // knownPaths (e.g. legacy merge) still wins.
  const knownPaths = options.knownPaths ?? listProjectFiles(projectRoot) ?? undefined;
  try {
    const result = await addLesson(projectRoot, input, { ...options, knownPaths });
    recordCapture(projectRoot, triggerKinds, result);
    // Opt-in auto-prune: GC structural cruft right after the graph changed,
    // reusing the working-tree walk we already did. No-op unless config enables
    // it; never throws, so it can't break a successful capture.
    const autoPruned = await maybeAutoPrune(projectRoot, knownPaths);
    return autoPruned === null ? result : { ...result, autoPruned };
  } catch (err) {
    recordCapture(projectRoot, triggerKinds, null);
    throw err;
  }
}
