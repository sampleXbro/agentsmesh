/**
 * On Windows, the seen-store lock folder another recall is removing, or a store
 * file another recall is reading, fails mkdir or rename with EPERM for a short
 * time. The store keeps waiting for the lock instead of writing unlocked, and
 * retries the rename instead of dropping the write, so no session id is lost.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mkdirSyncMock = vi.hoisted(() => vi.fn());
const renameSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  mkdirSyncMock.mockImplementation(actual.mkdirSync);
  renameSyncMock.mockImplementation(actual.renameSync);
  return { ...actual, mkdirSync: mkdirSyncMock, renameSync: renameSyncMock };
});

const { readSeenStore, updateSeenStore } = await import('../../../src/lessons/seen-store.js');

const fail = (code: string): Error => Object.assign(new Error(code), { code });

let root: string;
let store: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-seen-win-retry-'));
  store = join(root, 'seen.json');
  mkdirSyncMock.mockClear();
  renameSyncMock.mockClear();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('updateSeenStore on Windows', () => {
  it('keeps waiting for a lock folder that is being removed, then takes it', () => {
    const lock = `${store}.lock`;
    mkdirSyncMock.mockImplementationOnce(() => undefined); // the parent folder
    mkdirSyncMock.mockImplementationOnce(() => {
      throw fail('EPERM');
    });

    updateSeenStore(store, () => ({ data: ['a'] }));

    const lockCalls = mkdirSyncMock.mock.calls.filter(([p]) => p === lock);
    expect([lockCalls.length, [...readSeenStore(store).ids]]).toEqual([2, ['a']]);
  });

  it('retries a rename that fails with EPERM instead of dropping the write', () => {
    renameSyncMock.mockImplementationOnce(() => {
      throw fail('EPERM');
    });

    updateSeenStore(store, () => ({ data: ['a'] }));

    expect([renameSyncMock.mock.calls.length, [...readSeenStore(store).ids]]).toEqual([2, ['a']]);
  });
});
