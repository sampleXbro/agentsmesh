/**
 * Changes to a process lock directory.
 *
 * Ownership moves only by removing the exact `owner-<token>` marker, which
 * fails once that marker is gone. Only whoever removed it may then tear the
 * dir down, so neither a release nor an eviction can delete a lock that has
 * already passed to another process.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { mkdir, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { renameWithRetry } from './rename-retry.js';
import {
  errorCode,
  holderPath,
  holderToken,
  ownerPath,
  ownerTokens,
  readHolderRaw,
  type LockMetadata,
  type LockState,
} from './process-lock-state.js';

/** Claims `lockPath` for `meta.token`; false when another process holds or wins it. */
export async function tryAcquire(
  lockPath: string,
  meta: LockMetadata & { token: string },
): Promise<boolean> {
  try {
    await mkdir(lockPath);
  } catch (err) {
    if (errorCode(err) === 'EEXIST') return false;
    throw err;
  }
  const owner = ownerPath(lockPath, meta.token);
  let writingHolder = false;
  try {
    await mkdir(owner);
    // A stalled claimer can land in this dir too; only a sole owner goes on.
    if ((await ownerTokens(lockPath))?.length !== 1) return await backOff(lockPath, owner);
    writingHolder = true;
    // `wx`: never overwrite another holder's metadata.
    await writeFile(holderPath(lockPath), JSON.stringify(meta), { encoding: 'utf-8', flag: 'wx' });
  } catch (err) {
    const code = errorCode(err);
    if (code === 'ENOENT' || code === 'EEXIST') return backOff(lockPath, owner);
    if (writingHolder) await rm(holderPath(lockPath), { force: true }).catch(() => {});
    await backOff(lockPath, owner);
    throw err;
  }
  // The marker can be evicted while this process stalls mid-claim; then the claim is lost.
  if (existsSync(owner)) return true;
  await teardown(lockPath, [meta.token]);
  return false;
}

/** Sync `evictOwners(lockPath, [token])` for exit and signal handlers. */
export function releaseOwnedSync(lockPath: string, token: string): void {
  try {
    rmdirSync(ownerPath(lockPath, token));
  } catch {
    return;
  }
  try {
    if (holderToken(readFileSync(holderPath(lockPath), 'utf-8')) === token) {
      unlinkSync(holderPath(lockPath));
    }
  } catch {
    // Already gone.
  }
  try {
    rmdirSync(lockPath);
  } catch {
    // Not empty or already gone.
  }
}

/** Removes a lock judged stale, but only if the judged holder still owns it. */
export async function evict(lockPath: string, state: LockState): Promise<void> {
  if (state.kind === 'held') return evictOwners(lockPath, [state.token]);
  if (state.kind === 'orphan' && state.tokens.length > 0) {
    return evictOwners(lockPath, state.tokens);
  }
  if (state.kind === 'legacy' || state.kind === 'orphan') return dropUnowned(lockPath, state.raw);
}

/** Gives up the holds of `tokens`; a no-op for any token that no longer owns the lock. */
export async function evictOwners(lockPath: string, tokens: readonly string[]): Promise<void> {
  const removed: string[] = [];
  for (const token of tokens) {
    if (await removeOwner(lockPath, token)) removed.push(token);
  }
  if (removed.length > 0) await teardown(lockPath, removed);
}

/** Windows fails rmdir with these for a moment while another process removes the same dir. */
const TRANSIENT_RMDIR_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RMDIR_ATTEMPTS = 5;

async function removeOwner(lockPath: string, token: string): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rmdir(ownerPath(lockPath, token));
      return true;
    } catch (err) {
      const code = errorCode(err);
      if (code === 'ENOENT') return false;
      const transient = code !== undefined && TRANSIENT_RMDIR_CODES.has(code);
      if (!transient || attempt >= RMDIR_ATTEMPTS) throw err;
      await sleep(25 * 2 ** (attempt - 1));
    }
  }
}

/**
 * Removes a dir after this process removed the markers of `tokens`. If the
 * lock passed to a new holder meanwhile, its holder.json carries another
 * token and `rmdir` fails on its non-empty dir, so nothing of it is removed.
 */
async function teardown(lockPath: string, tokens: readonly string[]): Promise<void> {
  const token = holderToken(await readHolderRaw(lockPath));
  if (token !== undefined && tokens.includes(token)) {
    await unlink(holderPath(lockPath)).catch(() => {});
  }
  await rmdir(lockPath).catch(() => {});
}

/**
 * Removes a lock dir with no owner marker (older version, or abandoned while
 * being created). It is moved aside and checked first: a dir that changed
 * since it was judged is put back instead of deleted.
 */
async function dropUnowned(lockPath: string, judgedRaw: string | null): Promise<void> {
  const aside = `${lockPath}.${randomUUID()}.stale`;
  try {
    await renameWithRetry(lockPath, aside);
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return;
    throw err;
  }
  const owners = await ownerTokens(aside);
  if (owners?.length !== 0 || (await readHolderRaw(aside)) !== judgedRaw) {
    return putBack(aside, lockPath);
  }
  try {
    await rm(aside, { recursive: true, force: true });
  } catch (err) {
    await putBack(aside, lockPath);
    throw err;
  }
}

async function putBack(aside: string, lockPath: string): Promise<void> {
  await rename(aside, lockPath).catch(() => {});
}

async function backOff(lockPath: string, owner: string): Promise<false> {
  await rmdir(owner).catch(() => {});
  // Removes the claim dir only if nothing else is in it.
  await rmdir(lockPath).catch(() => {});
  return false;
}
