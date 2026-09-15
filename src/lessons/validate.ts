import { LessonsGraphSchema, type LessonsGraph } from './graph-schema.js';
import {
  collectDanglingRefs,
  collectDuplicateRefs,
  collectLifecycleInvariants,
  collectOrphans,
  collectReachability,
  collectStatusInvariants,
} from './validate-checks.js';
import {
  collectBackslashGlobPatterns,
  collectDuplicateRules,
  collectDuplicateTriggers,
  collectFanout,
  collectTriggerSetCollisions,
  collectInvalidTriggerPatterns,
} from './validate-quality.js';
import { collectLowSignalKeywords, collectStopwordKeywords } from './validate-keywords.js';
import {
  collectBroadCommandPatterns,
  collectBroadFileGlobs,
  collectDeadFileGlobs,
  collectRunnerAnchoredPatterns,
} from './validate-liveness.js';

export type ValidationLevel = 'error' | 'warning';

export interface ValidationFinding {
  readonly level: ValidationLevel;
  readonly code: string;
  readonly message: string;
  readonly lessonId?: string;
  /** Every lesson one aggregate finding covers (machine-readable; the message names a few). */
  readonly lessonIds?: readonly string[];
  readonly topicId?: string;
  readonly triggerId?: string;
}

export interface ValidationReport {
  /** True when no `error`-level findings exist (warnings do not affect `ok`). */
  readonly ok: boolean;
  readonly findings: ValidationFinding[];
}

export interface ValidateOptions {
  /**
   * Working-tree file list (project-relative, forward-slash) for the dead-glob
   * liveness check. When omitted the check is SKIPPED — the pure write-barrier
   * call in `mutate.ts` passes nothing, so `add` never walks the tree and a
   * liveness warning can never block a write. The CLI/lint callers supply it.
   */
  readonly knownPaths?: ReadonlySet<string>;
}

export function validateLessonsGraph(
  graph: LessonsGraph,
  options: ValidateOptions = {},
): ValidationReport {
  const findings: ValidationFinding[] = [];

  const schemaResult = LessonsGraphSchema.safeParse(graph);
  if (!schemaResult.success) {
    findings.push({
      level: 'error',
      code: 'SCHEMA_INVALID',
      message: schemaResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return { ok: false, findings };
  }

  collectDanglingRefs(graph, findings);
  collectDuplicateRefs(graph, findings);
  collectStatusInvariants(graph, findings);
  collectLifecycleInvariants(graph, findings);
  collectDuplicateRules(graph, findings);
  collectReachability(graph, findings);
  collectInvalidTriggerPatterns(graph, findings);
  collectBackslashGlobPatterns(graph, findings);
  collectDuplicateTriggers(graph, findings);
  collectOrphans(graph, findings);
  collectFanout(graph, findings);
  collectTriggerSetCollisions(graph, findings);
  collectLowSignalKeywords(graph, findings);
  collectStopwordKeywords(graph, findings);
  collectRunnerAnchoredPatterns(graph, findings);
  collectBroadCommandPatterns(graph, findings);
  collectBroadFileGlobs(graph, findings);
  if (options.knownPaths !== undefined) collectDeadFileGlobs(graph, findings, options.knownPaths);

  const ok = findings.every((f) => f.level !== 'error');
  return { ok, findings };
}
