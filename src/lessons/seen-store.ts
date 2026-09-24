import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isTransientFsError, retryTransientSync } from '../utils/filesystem/transient-fs.js';

/**
 * File-IO half of session dedup, split from seen-cache.ts for the 200-line
 * limit. Two on-disk shapes coexist: the legacy flat array of delivered ids
 * (untimed sessions — harness/hook and explicit ids), and a v2 object
 * `{ v: 2, seen: { id: deliveredAtMs } }` for TTL sessions (the `--session
 * auto` day bucket), whose entries expire so a later same-day session is not
 * starved. Every operation is best-effort — dedup is an optimization and must
 * never break the blocking recall path.
 */

const SEEN_DIR = 'agentsmesh-lessons-seen';

/** Short, stable, dependency-free hash (djb2) of a string, base-36. */
export function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Store location. `projectRoot` namespaces by a hash of the resolved root, so
 * two projects sharing one session id keep SEPARATE dedup state. Omitted → the
 * legacy flat path.
 */
export function seenStorePath(id: string, projectRoot?: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
  const scoped = projectRoot === undefined ? safe : `${safe}__${shortHash(resolve(projectRoot))}`;
  return join(tmpdir(), SEEN_DIR, `${scoped}.json`);
}

/** Parsed store: v2 carries per-id delivery stamps; legacy arrays carry ids only. */
export interface StoredSeen {
  readonly ids: ReadonlySet<string>;
  /** null for a legacy array store (no timestamps recorded). */
  readonly stamps: ReadonlyMap<string, number> | null;
  /**
   * Last time this session did ANYTHING (v2 only; absent on stores written
   * before the field existed). Distinct from the delivery stamps: a recall that
   * delivered nothing still counts as activity — see session-window.ts.
   */
  readonly lastAt?: number;
}

/** Read a store, tolerating both shapes; anything unreadable is an empty store. */
export function readSeenStore(path: string): StoredSeen {
  if (!existsSync(path)) return { ids: new Set(), stamps: null };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (Array.isArray(parsed)) {
      const ids = new Set(parsed.filter((x): x is string => typeof x === 'string'));
      return { ids, stamps: null };
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const seen = (parsed as Record<string, unknown>).seen;
      if (typeof seen === 'object' && seen !== null) {
        const stamps = new Map<string, number>();
        for (const [id, ms] of Object.entries(seen)) {
          if (typeof ms === 'number') stamps.set(id, ms);
        }
        const lastAt = (parsed as Record<string, unknown>).lastAt;
        return {
          ids: new Set(stamps.keys()),
          stamps,
          ...(typeof lastAt === 'number' ? { lastAt } : {}),
        };
      }
    }
    return { ids: new Set(), stamps: null };
  } catch {
    return { ids: new Set(), stamps: null };
  }
}

/** Atomic best-effort write; an array writes the legacy shape, a map writes v2. */
export function writeSeenStore(
  path: string,
  data: readonly string[] | ReadonlyMap<string, number>,
  lastAt?: number,
): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const body =
      data instanceof Map
        ? JSON.stringify({ v: 2, lastAt: lastAt ?? Date.now(), seen: Object.fromEntries(data) })
        : JSON.stringify(data);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, body, 'utf8');
    // Windows: renaming onto a store another recall is reading fails with EPERM for a moment.
    retryTransientSync(() => renameSync(tmp, path));
  } catch {
    // Optimization only — never fail recall because the seen store could not be written.
  }
}

/** Best-effort removal (context reset). */
export function removeSeenStore(path: string): void {
  try {
    rmSync(path, { force: true, recursive: true });
  } catch {
    // Never let a dedup-reset failure break the blocking recall path.
  }
}

/** What an update writes: ids (legacy shape) or stamps (v2), or null for no write. */
export interface SeenWrite {
  readonly data: readonly string[] | ReadonlyMap<string, number>;
}

/** How long a commit waits for another recall's lock before writing anyway. */
const LOCK_WAIT_MS = 2_000;
/** A lock this old was left by a crashed process. */
const LOCK_STALE_MS = 10_000;
const pause = new Int32Array(new SharedArrayBuffer(4));

function lockIsStale(lock: string): boolean {
  try {
    return Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}

/** Take the store's lock folder; false when it stays busy (the caller goes on unlocked). */
function takeLock(lock: string): boolean {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(dirname(lock), { recursive: true });
      mkdirSync(lock);
      return true;
    } catch (err) {
      // A lock another recall is removing fails with EPERM on Windows: still busy, not broken.
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' && !isTransientFsError(err)) {
        return false;
      }
    }
    if (lockIsStale(lock)) removeSeenStore(lock);
    else if (Date.now() >= deadline) return false;
    else Atomics.wait(pause, 0, 0, 5);
  }
}

/**
 * Apply `update` to the LATEST store under a short lock, so overlapping recalls
 * add to each other's deliveries instead of overwriting them. Best-effort: a
 * lock that never frees means an unlocked write, never a failed recall.
 */
export function updateSeenStore(
  path: string,
  update: (latest: StoredSeen) => SeenWrite | null,
): void {
  const lock = `${path}.lock`;
  const locked = takeLock(lock);
  try {
    const next = update(readSeenStore(path));
    if (next !== null) writeSeenStore(path, next.data);
  } finally {
    if (locked) removeSeenStore(lock);
  }
}
