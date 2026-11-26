import type { RankedLesson } from './ranking.js';

/** Options shared by every recall path: the migrating API and the graph-in core. */
export interface RecallCoreOptions {
  /** Max ranked lessons to return. Defaults to {@link DEFAULT_RECALL_LIMIT}. */
  readonly limit?: number;
  /**
   * Cumulative rule-token budget. Defaults to {@link DEFAULT_RECALL_MAX_TOKENS};
   * pass `null` to disable the budget (return up to `limit` results).
   */
  readonly maxTokens?: number | null;
  /**
   * Session correlator for recall dedup. Defaults to `AGENTSMESH_SESSION_ID`;
   * when set, lessons already delivered this session are suppressed.
   */
  readonly sessionId?: string;
  /** Force dedup off even when a session correlator is present. */
  readonly noDedup?: boolean;
  /**
   * Expire suppressions this long after delivery. Set by callers that have NO
   * context-reset signal (the MCP server never sees the client compact), so a
   * lesson dropped from a summarized context cannot stay hidden forever. The
   * hook path leaves this unset on purpose: it resets on SessionStart
   * compact/clear, which is the exact signal a wall-clock TTL only approximates.
   */
  readonly ttlMs?: number;
  /**
   * Diagnostic dump (CLI `--all`): skip both the limit and the token budget.
   * Recorded as a bypass in recall telemetry, not as mandatory recall.
   */
  readonly all?: boolean;
  /**
   * Last cut on the ranked lessons, run before dedup commits them and telemetry
   * records them. A caller whose output has its own size cap uses it so only
   * what is really printed counts as delivered. Return the leading lessons.
   */
  readonly trim?: (ranked: RankedLesson[]) => RankedLesson[];
}

export interface RecallOptions extends RecallCoreOptions {
  /**
   * Migrate a legacy store first (default true). The hook passes false: the
   * migration deletes files, so it only runs from a command the user runs.
   */
  readonly autoMigrate?: boolean;
}

export interface RecallResult {
  /** Relevance-ranked, capped lessons (compact metadata lives on each entry). */
  readonly lessons: RankedLesson[];
  /** How many active lessons matched the query before the caps were applied. */
  readonly totalMatches: number;
  /**
   * True when the canonical graph existed but could not be read (corrupt JSON /
   * schema drift). Recall degrades to empty instead of throwing; callers surface
   * this so a corrupt graph is a visible warning, not silent zero recall.
   */
  readonly corrupt?: boolean;
  /**
   * Set to the on-disk schema version when the graph is newer than this build
   * understands. Recall degrades to empty (like `corrupt`) but callers surface
   * an upgrade hint rather than a "corrupt" warning.
   */
  readonly newerVersion?: number;
  /**
   * Count of matched lessons suppressed because they were already delivered
   * earlier in this session (dedup). 0 when dedup is off or nothing repeated.
   */
  readonly suppressed: number;
  /**
   * Why the legacy auto-migration failed. Recall still degrades (the graph looks
   * absent, so no lessons) but callers surface this so the failure is not silent.
   */
  readonly migrationError?: string;
}
