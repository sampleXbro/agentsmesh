import { McpError } from '../errors.js';
import { TargetNotFoundError } from '../../public/index.js';

export interface GenerateHandlerResult {
  filesWritten: number;
  byTarget: Record<string, { filesWritten: number }>;
  /** True when the run rewrote `.agentsmesh/.lock`; generate leaves it alone when nothing changed. */
  lockfileUpdated: boolean;
  errors: string[];
  warnings: string[];
  files?: string[];
}

export interface LintHandlerResult {
  issues: Array<{ level: 'error' | 'warning'; file: string; target: string; message: string }>;
}

export interface CheckHandlerResult {
  drift: boolean;
  /** True when the lock file has git conflict markers; `agentsmesh merge` rebuilds it. */
  lockConflict: boolean;
  /**
   * Set when `.agentsmesh/lessons/lessons.json` cannot be read; `agentsmesh check`
   * fails then, with this text as its JSON `error`. Null otherwise.
   */
  lessonsGraphError: string | null;
  canonicalDrift: boolean;
  outputDrift: boolean;
  missing: string[];
  extra: string[];
  modified: string[];
  /** Generated outputs whose on-disk hash differs from the lock. */
  outputsModified: string[];
  /** Generated outputs recorded in the lock but missing from disk. */
  outputsRemoved: string[];
  /** Managed generated outputs present on disk but absent from the lock. */
  outputsStale: string[];
  /** Targets a `generate --targets` run left out after canonical sources changed. */
  staleTargets: string[];
  /**
   * True when generated-output drift was verified; false for old-format locks
   * without an `outputs` map.
   */
  outputsChecked: boolean;
}

export interface DiffHandlerResult {
  willCreate: number;
  willModify: number;
  willDelete: number;
}

export interface ImportHandlerResult {
  imported: number;
  files: Array<{ fromPath: string; toPath: string; feature: string }>;
  warnings: string[];
  errors: string[];
}

export interface ConvertHandlerResult {
  filesAffected: number;
  dryRun: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Translate an engine-level exception into the appropriate `McpError`. Used by
 * every orchestration handler so the wrapper logic lives in one place.
 */
export function wrapEngineError(e: unknown): never {
  if (e instanceof McpError) throw e;
  if (e instanceof TargetNotFoundError) {
    throw new McpError('VALIDATION_FAILED', e.message);
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/unknown.*--from|unknown.*--to|unknown target/i.test(msg)) {
    throw new McpError('VALIDATION_FAILED', msg);
  }
  if (/lock/i.test(msg)) throw new McpError('LOCK_HELD', 'generate lock is held');
  throw new McpError('IO_ERROR', 'engine failure', { reason: msg });
}
