import { existsSync } from 'node:fs';
import { CURRENT_GRAPH_VERSION } from './graph-schema.js';
import { deleteLegacyArtifacts } from './import-legacy-parse.js';
import { mergeLegacy } from './import-legacy-merge.js';
import { readLegacySource, type LegacySource } from './import-legacy-read.js';
import { lessonsPaths } from './paths.js';
import { mutateLessonsGraphLocked } from './mutate.js';

export { LegacyTopicPathError } from './import-legacy-read.js';

export interface ImportLegacyOptions {
  /** ISO date stamped onto every imported lesson's `createdAt`. */
  readonly migratedAt: string;
  /**
   * When `true` (default), delete the legacy `index.yaml`, `journal.md`,
   * `topics/`, `distill-ledger.yaml`, and `distill-proposal.md` after a
   * successful migration. Pass `false` to leave them in place (test-only).
   */
  readonly deleteLegacy?: boolean;
  /**
   * Overwrite an existing non-empty graph. Default `false`: migration refuses
   * (throws {@link LessonsGraphExistsError}) when, AT WRITE TIME UNDER THE LOCK,
   * the graph already has lessons — so a concurrent capture is never erased.
   */
  readonly force?: boolean;
  /**
   * MERGE legacy lessons INTO an existing graph instead of replacing it. This is
   * the recovery path for a stranded state — legacy `index.yaml` coexisting with
   * a populated `lessons.json` (an old binary could create this). Each legacy
   * lesson is folded in via the normal capture path: rules dedup by text,
   * triggers content-address and dedup, topics union. Never overwrites graph
   * data; `force` is irrelevant in this mode.
   */
  readonly merge?: boolean;
  /**
   * Refuse ({@link LessonsGraphExistsError}) when `lessons.json` exists at write
   * time under the lock, even if empty. Auto-migration sets this so two first
   * writers cannot both migrate.
   */
  readonly requireAbsentGraph?: boolean;
}

/** Thrown when migration would overwrite an already-populated graph without `force`. */
export class LessonsGraphExistsError extends Error {
  readonly code = 'LESSONS_GRAPH_EXISTS';
  constructor() {
    super('importLegacyLessons: a non-empty lessons.json already exists; pass force to overwrite.');
    this.name = 'LessonsGraphExistsError';
  }
}

export interface ImportLegacyReport {
  readonly wroteGraphPath: string;
  readonly deletedPaths: string[];
  readonly topicCount: number;
  readonly lessonCount: number;
  readonly triggerCount: number;
}

/**
 * One-shot upgrade migrator: reads the legacy YAML index + per-topic
 * Markdown files, emits the new JSON graph, and (by default) removes every
 * legacy artifact so the project lands in a clean state on the new system.
 *
 * Deterministic over (input, options): the graph output and deletion list are
 * fixed. Requires the legacy `index.yaml` to exist — it is read unconditionally
 * and a missing index throws (ENOENT). Callers MUST guard with
 * `existsSync(lessonsPaths(root).index)` before invoking (see
 * `maybeAutoMigrateLessons` and the `import-md` handler); re-running on a
 * post-migration tree, where the legacy files are already gone, throws.
 * Topic files outside `.agentsmesh/lessons/` are refused (LegacyTopicPathError).
 */
export async function importLegacyLessons(
  projectRoot: string,
  options: ImportLegacyOptions,
): Promise<ImportLegacyReport> {
  const paths = lessonsPaths(projectRoot);
  if (options.merge === true) {
    const { specs, summaryByTopic } = await readLegacySource(projectRoot, options.migratedAt);
    return mergeLegacy(projectRoot, paths, specs, summaryByTopic, options);
  }

  // Write through the transactional path: lock → load → replace → VALIDATE →
  // atomic save. mutate throws on any error-level finding (e.g. two identical
  // legacy rules → DUPLICATE_RULE), so an invalid migration never persists and
  // the legacy source below is left intact (fail closed).
  const { topics, lessons, triggers } = await mutateLessonsGraphLocked(projectRoot, async (g) => {
    // Existence is checked UNDER the lock (callers' checks are racy), and the
    // legacy store is read only after it, so a waiter never re-reads a store a
    // concurrent migrator already consumed. "Populated" means ANY content.
    if (options.requireAbsentGraph === true && existsSync(paths.graph)) {
      throw new LessonsGraphExistsError();
    }
    const populated =
      Object.keys(g.lessons).length > 0 ||
      Object.keys(g.topics).length > 0 ||
      Object.keys(g.triggers).length > 0;
    if (options.force !== true && populated) {
      throw new LessonsGraphExistsError();
    }
    const source: LegacySource = await readLegacySource(projectRoot, options.migratedAt);
    g.version = CURRENT_GRAPH_VERSION;
    g.lessons = source.lessons;
    g.topics = source.topics;
    g.triggers = source.triggers;
    return source;
  });

  const deletedPaths = options.deleteLegacy === false ? [] : deleteLegacyArtifacts(paths.base);

  return {
    wroteGraphPath: paths.graph,
    deletedPaths,
    topicCount: Object.keys(topics).length,
    lessonCount: Object.keys(lessons).length,
    triggerCount: Object.keys(triggers).length,
  };
}
