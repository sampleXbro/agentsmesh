import type { MatchedLesson } from './query.js';
import {
  readSeenStore,
  removeSeenStore,
  seenStorePath,
  updateSeenStore,
  type StoredSeen,
} from './seen-store.js';
import { autoSessionId, dayBucketId, isIdleSession, stampAgeMs } from './session-window.js';
import { sessionId as envSessionId } from './telemetry.js';

// The session-window policy (correlator + expiry windows) lives next door;
// re-exported here so `seen-cache` stays the one import for session dedup.
export { AUTO_SESSION_IDLE_MS, AUTO_SESSION_TTL_MS, autoSessionId } from './session-window.js';

/**
 * Session-scoped recall dedup. Recall is stateless and deterministic, so the
 * same `--file` returns the identical rules every time — N recalls touching one
 * area re-deliver the same ~280 tokens N times. When a session correlator is
 * present (`AGENTSMESH_SESSION_ID` or an explicit `--session`), this suppresses
 * lessons already delivered earlier in the session so each recall carries only
 * what is NEW. Opt-in: with no correlator the recall path is untouched.
 *
 * The per-session set of delivered lesson ids lives in the OS temp dir (not the
 * project tree — see seen-store.ts), so it never dirties `.agentsmesh/` and the
 * OS reclaims it. TTL sessions (the `--session auto` day bucket) stamp each
 * delivery and expire entries after {@link AUTO_SESSION_TTL_MS}, so a fresh
 * agent session later the same day is not starved by the morning's deliveries.
 */

export interface SessionDedup {
  readonly sessionId: string;
  readonly seen: ReadonlySet<string>;
  readonly path: string;
  /** Per-id delivery stamps from a v2 store; null for legacy array stores. */
  readonly stamps: ReadonlyMap<string, number> | null;
  /** Set for TTL sessions: an entry suppresses only within this window. */
  readonly ttlMs?: number;
  /** When an idle session dropped its old set on open; commits keep only newer writes. */
  readonly resetAt?: number;
}

export interface OpenDedupOptions {
  /** Explicit session id (CLI `--session`); wins over the environment. */
  readonly explicit?: string;
  /** Force dedup off (CLI `--no-dedup`) even when a correlator is present. */
  readonly disabled?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Project root. Namespaces the seen file by a hash of the resolved root, so two
   * projects sharing one fixed `AGENTSMESH_SESSION_ID` (e.g. a CI runner that
   * exports it once) keep SEPARATE dedup state — otherwise project B inherits
   * project A's "seen" set and suppresses coincidentally-colliding lesson ids.
   * Omitted → the legacy flat path (unchanged behavior).
   */
  readonly projectRoot?: string;
  /**
   * Expire suppressions after this window (TTL sessions — the auto day bucket).
   * A legacy array store has no stamps and is treated as fully expired under a
   * TTL: the safe direction is re-delivery, never over-suppression.
   */
  readonly ttlMs?: number;
}

/**
 * Open the dedup state for the current session, or `null` when dedup is off —
 * no correlator set, or explicitly disabled. `null` is the default, fully
 * stateless path, so existing behavior is unchanged unless a session is named.
 */
export function openSessionDedup(options: OpenDedupOptions = {}): SessionDedup | null {
  if (options.disabled === true) return null;
  const id =
    options.explicit !== undefined && options.explicit.trim().length > 0
      ? options.explicit.trim()
      : envSessionId(options.env);
  if (id === undefined) return null;
  const path = seenStorePath(id, options.projectRoot);
  const store = readSeenStore(path);
  // A signal-less session that has gone quiet belonged to a context that is
  // gone: drop the whole set, and drop the stamps too so the next commit cannot
  // resurrect it (see AUTO_SESSION_IDLE_MS).
  const stale = options.ttlMs !== undefined && isIdleSession(store.stamps, store.lastAt);
  const stamps = stale ? null : store.stamps;
  return {
    sessionId: id,
    seen: stale ? new Set<string>() : visibleSeen(store.ids, stamps, options.ttlMs),
    path,
    stamps,
    ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
    ...(stale ? { resetAt: Date.now() } : {}),
  };
}

/** Under a TTL only stamped-and-fresh entries suppress; untimed stores suppress fully. */
function visibleSeen(
  ids: ReadonlySet<string>,
  stamps: ReadonlyMap<string, number> | null,
  ttlMs: number | undefined,
): ReadonlySet<string> {
  if (ttlMs === undefined) return ids;
  if (stamps === null) return new Set();
  const now = Date.now();
  const fresh = new Set<string>();
  for (const [id, ms] of stamps) if (stampAgeMs(ms, now) <= ttlMs) fresh.add(id);
  return fresh;
}

/**
 * Discard the per-session seen set, so subsequent recalls re-inject as if fresh.
 * Called when the model's context was actually reset — a `SessionStart`
 * `compact`/`clear` — so dedup (which assumes a delivered lesson stays in context)
 * does not keep suppressing lessons the summarization dropped. Best-effort: a
 * failed remove just leaves the stale set, degrading to today's behavior.
 */
export function clearSeen(sessionId: string, projectRoot?: string): void {
  removeSeenStore(seenStorePath(sessionId, projectRoot));
}

/**
 * Apply a harness `SessionStart` to dedup state. `resume` is the ONLY source
 * that keeps the sets, because it is the only one where the prior context comes
 * back; `compact`, `clear`, `startup`, and any source this build does not model
 * (or a harness that omits the field) all mean the context those suppressions
 * were based on is gone. Both the harness session store AND the CLI/MCP
 * correlator stores are cleared: they are separate files, and clearing only the
 * first left an agent's own `--session auto` recalls suppressed after a
 * compaction. Re-showing a rule costs tokens; hiding one from a context that
 * never saw it defeats the recall gate, so this errs toward clearing.
 */
export function clearSeenForSessionStart(
  source: string | undefined,
  sessionId: string | undefined,
  projectRoot: string,
): void {
  if (source === 'resume') return;
  if (sessionId !== undefined) clearSeen(sessionId, projectRoot);
  // The CLI/MCP correlators live in other stores, resolved in other processes
  // whose environments need not match this one — clear every key they could
  // have used rather than assuming they agreed with us.
  for (const id of new Set([autoSessionId(), dayBucketId()])) clearSeen(id, projectRoot);
}

/**
 * Drop matches already delivered this session BEFORE ranking, so the limit +
 * token budget fill with FRESH lessons rather than wasting slots on repeats.
 */
export function filterUnseen(
  dedup: SessionDedup,
  matches: readonly MatchedLesson[],
): MatchedLesson[] {
  return matches.filter((m) => !dedup.seen.has(m.id));
}

/**
 * Record the ids actually returned so a later recall this session suppresses
 * them. Best-effort and atomic (see seen-store).
 *
 * The written SHAPE follows the shape that was read, never the caller's mode:
 * one correlator can be shared by a TTL writer (CLI `--session auto`) and an
 * untimed one (hook/MCP), which happens whenever `AGENTSMESH_SESSION_ID` is
 * exported. An untimed commit that downgraded a stamped store back to the bare
 * array would discard every timestamp, and the next TTL read — which treats an
 * unstamped store as fully expired — would suppress nothing, silently zeroing
 * dedup for the rest of the session. So a stamped store stays stamped; only a
 * session that never saw one keeps writing the legacy array (an older binary
 * must still be able to read what this one writes).
 */
export function commitSeen(dedup: SessionDedup, returnedIds: readonly string[]): void {
  updateSeenStore(dedup.path, (latest) => {
    const store =
      dedup.resetAt !== undefined && (latest.lastAt ?? 0) <= dedup.resetAt ? EMPTY : latest;
    // A recall that delivered nothing still proves the session is ALIVE. Record
    // that (cheaply, and only for stamped sessions, which are the ones whose idle
    // gap can reset them) so steady work is not mistaken for an abandoned chat.
    if (returnedIds.length === 0) {
      return dedup.ttlMs !== undefined && store.stamps !== null ? { data: store.stamps } : null;
    }
    if (dedup.ttlMs !== undefined || store.stamps !== null) {
      const now = Date.now();
      const merged = new Map<string, number>();
      // Prune expired siblings only when this session actually has a TTL; an
      // untimed session preserves every stamp it read.
      for (const [id, ms] of store.stamps ?? []) {
        if (dedup.ttlMs === undefined || now - ms <= dedup.ttlMs) merged.set(id, ms);
      }
      for (const id of returnedIds) merged.set(id, now);
      return { data: merged };
    }
    const union = new Set(store.ids);
    for (const id of returnedIds) union.add(id);
    return union.size === store.ids.size ? null : { data: [...union] };
  });
}

const EMPTY: StoredSeen = { ids: new Set(), stamps: null };
