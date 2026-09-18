import { shortHash } from './seen-store.js';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { LessonsGraph } from './graph-schema.js';
import { graphFilePath } from './graph-store.js';
import { commandCouldMatch } from './query.js';
import { appendRecallRecord, sessionId as envSessionId } from './telemetry.js';

/**
 * Command-recall fast path. The hook recalls on EVERY shell command, but a
 * graph holds few command_pattern/keyword triggers relative to the command
 * firehose, so most command-only recalls provably match nothing yet still pay
 * a full graph parse + outcome-log read (field-measured at >80% no-match). This
 * caches the active command-reachable trigger patterns in the OS temp dir
 * (never the project tree), stamped with the graph file's (mtimeMs, size):
 * a stale or missing or corrupt cache ALWAYS falls back to the full path, so
 * the worst failure mode is "no speedup", never a skipped match. Matching
 * reuses `commandCouldMatch` — the exact engine `queryLessons` runs — so the
 * fast "cannot match" verdict and the full path agree by construction.
 */

const FASTPATH_DIR = 'agentsmesh-lessons-cmdidx';

interface FastpathCache {
  readonly stamp: { readonly mtimeMs: number; readonly size: number };
  readonly commandPatterns: readonly string[];
  readonly keywordPatterns: readonly string[];
}

/** Short, stable, dependency-free hash (djb2) of a string, base-36. */
/** Cache location (per project, in the OS temp dir). Exported for tests. */
export function commandFastpathCachePath(projectRoot: string): string {
  return join(tmpdir(), FASTPATH_DIR, `${shortHash(resolve(projectRoot))}.json`);
}

/**
 * The graph file's freshness stamp RIGHT NOW. Callers that go on to read the
 * graph must take this BEFORE the read and hand it to
 * {@link refreshCommandFastpath} — stamping after the read races a concurrent
 * atomic graph write (stale patterns under a fresh stamp = a poisoned cache
 * that produces false "cannot match" verdicts until the next write).
 */
export function currentGraphStamp(projectRoot: string): { mtimeMs: number; size: number } | null {
  try {
    const s = statSync(graphFilePath(projectRoot));
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

function isStringArray(v: unknown): v is readonly string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function readCache(path: string): FastpathCache | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const c = parsed as Record<string, unknown>;
    const stamp = c.stamp as Record<string, unknown> | undefined;
    if (
      typeof stamp?.mtimeMs !== 'number' ||
      typeof stamp.size !== 'number' ||
      !isStringArray(c.commandPatterns) ||
      !isStringArray(c.keywordPatterns)
    ) {
      return null;
    }
    return {
      stamp: { mtimeMs: stamp.mtimeMs, size: stamp.size },
      commandPatterns: c.commandPatterns,
      keywordPatterns: c.keywordPatterns,
    };
  } catch {
    return null;
  }
}

/**
 * Write (or freshen) the cache from a loaded graph. Best-effort: any failure is
 * swallowed — the cache is an optimization, never a dependency. Extraction
 * mirrors `queryLessons`'s lesson filter: triggers reachable via ACTIVE,
 * non-always lessons only (always-on lessons are delivered, not matched).
 *
 * `preReadStamp` is the stamp the caller took BEFORE reading `graph`
 * ({@link currentGraphStamp}). The write happens only when the file still
 * carries that exact stamp: a mismatch means an atomic write landed inside the
 * read window and `graph` no longer describes the file — caching it under the
 * new stamp would be a self-perpetuating false "cannot match". Skipping is
 * safe: the next recall re-reads and re-tries.
 */
export function refreshCommandFastpath(
  projectRoot: string,
  graph: LessonsGraph,
  preReadStamp: { mtimeMs: number; size: number } | null,
): void {
  try {
    if (preReadStamp === null) return;
    const stamp = currentGraphStamp(projectRoot);
    if (stamp === null) return;
    if (stamp.mtimeMs !== preReadStamp.mtimeMs || stamp.size !== preReadStamp.size) return;
    const path = commandFastpathCachePath(projectRoot);
    const existing = readCache(path);
    if (
      existing !== null &&
      existing.stamp.mtimeMs === stamp.mtimeMs &&
      existing.stamp.size === stamp.size
    ) {
      return;
    }
    const reachable = new Set<string>();
    for (const lesson of Object.values(graph.lessons)) {
      if (lesson.status !== 'active' || lesson.scope === 'always') continue;
      for (const t of lesson.triggers) reachable.add(t);
    }
    const commandPatterns: string[] = [];
    const keywordPatterns: string[] = [];
    for (const [id, trigger] of Object.entries(graph.triggers)) {
      if (!reachable.has(id)) continue;
      if (trigger.kind === 'command_pattern') commandPatterns.push(trigger.pattern);
      else if (trigger.kind === 'keyword') keywordPatterns.push(trigger.pattern);
    }
    const cache: FastpathCache = { stamp, commandPatterns, keywordPatterns };
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(cache), 'utf8');
    renameSync(tmp, path);
  } catch {
    // Optimization only — never let a cache write break recall.
  }
}

/**
 * True ONLY when a fresh cache proves no active trigger can match `command`.
 * Every uncertain condition (no cache, stale stamp, corrupt file, fs error)
 * returns false, sending the caller down the full recall path.
 */
export function commandDefinitelyUnmatched(projectRoot: string, command: string): boolean {
  try {
    const stamp = currentGraphStamp(projectRoot);
    if (stamp === null) return false;
    const cache = readCache(commandFastpathCachePath(projectRoot));
    if (cache === null) return false;
    if (cache.stamp.mtimeMs !== stamp.mtimeMs || cache.stamp.size !== stamp.size) return false;
    return !commandCouldMatch(cache.commandPatterns, cache.keywordPatterns, command);
  } catch {
    return false;
  }
}

/**
 * Telemetry parity for a fast-path exit: the full path writes a no-match recall
 * record, so the fast path must too or `stats` silently loses its no-match
 * volume. Gated on the same telemetry env inside appendRecallRecord.
 */
export function recordFastpathNoMatch(projectRoot: string, session?: string): void {
  const sess = session ?? envSessionId();
  appendRecallRecord(projectRoot, {
    ts: new Date().toISOString(),
    hasFile: false,
    hasCommand: true,
    hasKeyword: false,
    totalMatches: 0,
    returnedCount: 0,
    returnedTokens: 0,
    truncated: false,
    matchedByKind: { file: 0, command: 0, keyword: 0 },
    lessonIds: [],
    bypassed: false,
    ...(sess !== undefined ? { session: sess } : {}),
  });
}

/**
 * Hook-facing composite: true (after recording no-match telemetry) when this
 * tool call is a command-only recall that provably matches nothing. False for
 * anything uncertain or out of scope (file present, diff keyword present),
 * sending the hook down the full recall path.
 */
export function hookCommandFastpath(
  projectRoot: string,
  input: { file?: string; command?: string; keyword: string; sessionId?: string },
): boolean {
  if (input.file !== undefined || input.command === undefined || input.keyword.length > 0) {
    return false;
  }
  if (!commandDefinitelyUnmatched(projectRoot, input.command)) return false;
  recordFastpathNoMatch(projectRoot, input.sessionId);
  return true;
}
