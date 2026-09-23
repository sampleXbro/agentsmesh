import { maybeAutoMigrateLessons } from './auto-migrate.js';
import { CURRENT_GRAPH_VERSION, emptyGraph, type LessonsGraph } from './graph-schema.js';
import { saveLessonsGraph, tryLoadLessonsGraph } from './graph-store.js';
import { acquireLessonsLock } from './lessons-lock.js';
import { validateLessonsGraph, type ValidationFinding, type ValidationReport } from './validate.js';

export interface MutateOptions {
  readonly retries?: number;
}

/**
 * Stable identity of a finding, independent of its (churn-prone) message. Keyed on
 * code + the node it points at; findings carry a triggerId OR a lessonId (never a
 * topicId), so those two suffice to tell a pre-existing finding from a new one.
 */
function findingKey(f: ValidationFinding): string {
  return `${f.code}|${f.triggerId ?? ''}|${f.lessonId ?? ''}`;
}

function errorSignatures(report: ValidationReport): Set<string> {
  return new Set(report.findings.filter((f) => f.level === 'error').map(findingKey));
}

/**
 * The raw transactional write path (NO legacy migration): acquire the lock,
 * load (or start empty), apply `mutator`, **validate**, and only then persist
 * via the atomic save. Writes are serialized, never truncate the file, and never
 * persist an error-level-invalid graph.
 *
 * INTERNAL — not exported from the public surface. The legacy migrator
 * (`importLegacyLessons`) and scaffolding (`scaffoldLessons`) write through here
 * precisely because they must NOT trigger migration: the migrator IS the
 * migration (calling the migrating `mutateLessonsGraph` would recurse) and
 * scaffolding deliberately creates a fresh empty graph. Every other writer uses
 * `mutateLessonsGraph` below so a first write can never strand a legacy store.
 */
export async function mutateLessonsGraphLocked<T>(
  projectRoot: string,
  mutator: (graph: LessonsGraph) => T | Promise<T>,
  options: MutateOptions = {},
): Promise<Awaited<T>> {
  const release = await acquireLessonsLock(projectRoot, { retries: options.retries });
  try {
    const graph = tryLoadLessonsGraph(projectRoot) ?? emptyGraph();
    // Snapshot pre-existing error findings BEFORE applying the mutation. We only
    // block on errors this mutation INTRODUCES — a single pre-existing invalid
    // trigger (from a merge/hand-edit) must not permanently poison every future
    // capture. recall already skips invalid triggers safely at runtime.
    const baseline = errorSignatures(validateLessonsGraph(graph));
    // Await the mutator UNDER the lock so async mutations are fully applied
    // before we validate and persist — otherwise a Promise-returning mutator's
    // changes would be saved before they happened (silent data loss).
    const result = await mutator(graph);

    const report = validateLessonsGraph(graph);
    const introduced = report.findings.filter(
      (f) => f.level === 'error' && !baseline.has(findingKey(f)),
    );
    if (introduced.length > 0) {
      const errors = introduced.map((f) => `${f.code}: ${f.message}`).join('; ');
      throw new Error(
        `mutateLessonsGraph: refusing to write — this change introduces ${errors}. ` +
          '(Pre-existing graph issues are not blocking; run `agentsmesh lessons validate` to ' +
          'review and `lessons untrigger`/`prune` to repair them.)',
      );
    }

    // Upgrade-on-write: every persisted graph is stamped at the current version,
    // so a loaded legacy v1 graph migrates to v2 the first time it is mutated.
    graph.version = CURRENT_GRAPH_VERSION;
    saveLessonsGraph(projectRoot, graph);
    return result;
  } finally {
    await release();
  }
}

/**
 * The public transactional write path: migrate a legacy store FIRST (so even a
 * first raw mutation cannot create an empty `lessons.json` and strand
 * `index.yaml`), then run the locked transaction. Every mutating operation
 * (add, merge, deprecate, strip-markers, …) and any third-party consumer routes
 * through here. `maybeAutoMigrateLessons` is a no-op (one stat) when a graph
 * already exists or no legacy index is present, and runs before the lock is
 * taken, so there is no re-entrancy with the migrator's own locked write.
 */
export async function mutateLessonsGraph<T>(
  projectRoot: string,
  mutator: (graph: LessonsGraph) => T | Promise<T>,
  options: MutateOptions = {},
): Promise<Awaited<T>> {
  await maybeAutoMigrateLessons(projectRoot);
  return mutateLessonsGraphLocked(projectRoot, mutator, options);
}
