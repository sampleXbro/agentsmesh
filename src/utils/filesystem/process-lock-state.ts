/**
 * Reading a process lock directory.
 *
 * Layout: `<lock>/owner-<token>/` marks the current holder and `<lock>/holder.json`
 * describes it (pid, host, start time, token). A lock written by an older
 * version has only holder.json and no token.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { processIdentity } from './process-identity.js';

const HOLDER_FILE = 'holder.json';
const OWNER_PREFIX = 'owner-';
// A lock dir without a complete owner is being created or removed right now;
// past this window it counts as abandoned.
const YOUNG_LOCK_GRACE_MS = 2_000;
// A healthy critical section is short, so only older holders are probed for pid reuse.
const PID_REUSE_PROBE_AFTER_MS = 2_000;
// Hosts sharing a lock may disagree on the time a little. A start time (or dir
// mtime) further ahead than this cannot be a running holder's: it counts as stale.
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export interface LockMetadata {
  pid: number;
  started: number;
  hostname?: string;
  token?: string;
  /** Start identity of `pid` (see process-identity.ts). */
  procStart?: string;
}

export type LockState =
  | { kind: 'gone' }
  | { kind: 'young' }
  | { kind: 'held'; token: string; meta: LockMetadata }
  | { kind: 'legacy'; meta: LockMetadata; raw: string }
  | { kind: 'orphan'; tokens: string[]; raw: string | null };

/** Cached pid-reuse verdicts for one acquire call. */
export type ProbeCache = Map<string, Promise<boolean>>;

export function ownerPath(lockPath: string, token: string): string {
  return join(lockPath, `${OWNER_PREFIX}${token}`);
}

export function holderPath(lockPath: string): string {
  return join(lockPath, HOLDER_FILE);
}

export function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

/** Owner tokens inside `dir`, or null when `dir` does not exist. */
export async function ownerTokens(dir: string): Promise<string[] | null> {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((e) => e.startsWith(OWNER_PREFIX))
      .map((e) => e.slice(OWNER_PREFIX.length));
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return null;
    throw err;
  }
}

export async function readHolderRaw(dir: string): Promise<string | null> {
  return readFile(holderPath(dir), 'utf-8').catch(() => null);
}

/** Owner token recorded in holder.json text, if any. */
export function holderToken(raw: string | null): string | undefined {
  return raw === null ? undefined : parseMetadata(raw)?.token;
}

export async function inspectLock(lockPath: string): Promise<LockState> {
  const tokens = await ownerTokens(lockPath);
  if (tokens === null) return { kind: 'gone' };
  const raw = await readHolderRaw(lockPath);
  const meta = raw === null ? null : parseMetadata(raw);
  const [only] = tokens;
  if (meta && tokens.length === 1 && only !== undefined && meta.token === only) {
    return { kind: 'held', token: only, meta };
  }
  if (meta && raw !== null && tokens.length === 0 && meta.token === undefined) {
    return { kind: 'legacy', meta, raw };
  }
  const age = await dirAgeMs(lockPath);
  if (age === null) return { kind: 'gone' };
  // Negative ages (mtime a hair ahead of Date.now()) are young too.
  const young = age < YOUNG_LOCK_GRACE_MS && age >= -CLOCK_SKEW_TOLERANCE_MS;
  return young ? { kind: 'young' } : { kind: 'orphan', tokens, raw };
}

/** Dead same-host pid, reused pid, older than `staleMs`, or started in the future. */
export async function isStale(
  meta: LockMetadata,
  staleMs: number,
  cache: ProbeCache,
): Promise<boolean> {
  const age = Date.now() - meta.started;
  if (age > staleMs || age < -CLOCK_SKEW_TOLERANCE_MS) return true;
  if (meta.hostname && meta.hostname !== hostname()) return false;
  if (!isProcessAlive(meta.pid)) return true;
  if (meta.procStart === undefined || age < PID_REUSE_PROBE_AFTER_MS) return false;
  return pidReused(meta.pid, meta.procStart, cache);
}

export function describeHolder(state: LockState): string {
  if (state.kind !== 'held' && state.kind !== 'legacy') return 'unknown (unreadable lock metadata)';
  const { meta } = state;
  const host = meta.hostname ? `${meta.hostname}:` : '';
  return `${host}pid ${meta.pid} (running ${Math.max(0, Date.now() - meta.started)}ms)`;
}

async function dirAgeMs(lockPath: string): Promise<number | null> {
  try {
    return Date.now() - (await stat(lockPath)).mtimeMs;
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return null;
    throw err;
  }
}

function pidReused(pid: number, recorded: string, cache: ProbeCache): Promise<boolean> {
  const key = `${pid}:${recorded}`;
  let verdict = cache.get(key);
  if (!verdict) {
    verdict = processIdentity(pid).then((current) => current !== null && current !== recorded);
    cache.set(key, verdict);
  }
  return verdict;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process. EPERM = process exists but not ours (still alive).
    return errorCode(err) === 'EPERM';
  }
}

function parseMetadata(raw: string): LockMetadata | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.pid !== 'number' || typeof v.started !== 'number') return null;
  const optionalText = (x: unknown): boolean => x === undefined || typeof x === 'string';
  const textOk = [v.hostname, v.token, v.procStart].every(optionalText);
  return textOk ? (value as LockMetadata) : null;
}
