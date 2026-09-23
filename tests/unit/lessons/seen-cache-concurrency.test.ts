/**
 * Session dedup must not lose deliveries when recalls overlap: commitSeen used
 * to write back the set it read at open time, so of 20 parallel
 * `query --session x` runs only the last writers' ids survived.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitSeen, openSessionDedup } from '../../../src/lessons/seen-cache.js';
import { removeSeenStore, seenStorePath } from '../../../src/lessons/seen-store.js';

const run = promisify(execFile);
let root: string;
let session: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-seen-conc-'));
  session = `seen-conc-${process.pid}-${Date.now()}`;
});
afterEach(() => {
  removeSeenStore(seenStorePath(session, root));
  rmSync(root, { recursive: true, force: true });
});

const seenNow = (): string[] =>
  [...(openSessionDedup({ explicit: session, projectRoot: root })?.seen ?? [])].sort();

describe('commitSeen under overlap', () => {
  it('keeps both commits when two recalls opened the store before either wrote', () => {
    const first = openSessionDedup({ explicit: session, projectRoot: root })!;
    const second = openSessionDedup({ explicit: session, projectRoot: root })!;
    commitSeen(first, ['a']);
    commitSeen(second, ['b']);
    expect(seenNow()).toEqual(['a', 'b']);
  });

  it('takes over a lock left by a crashed recall', () => {
    const lock = `${seenStorePath(session, root)}.lock`;
    mkdirSync(lock, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    commitSeen(openSessionDedup({ explicit: session, projectRoot: root })!, ['a']);
    expect(seenNow()).toEqual(['a']);
    expect(existsSync(lock)).toBe(false);
  });

  it('writes anyway once a lock that never frees has waited 2 seconds', () => {
    const lock = `${seenStorePath(session, root)}.lock`;
    mkdirSync(lock, { recursive: true });
    const started = Date.now();

    commitSeen(openSessionDedup({ explicit: session, projectRoot: root })!, ['a']);

    expect(Date.now() - started).toBeGreaterThanOrEqual(2_000);
    expect([seenNow(), existsSync(lock)]).toEqual([['a'], true]);
  });

  it('keeps every id when 12 processes commit at once', async () => {
    const script = join(root, 'commit.mts');
    const seenCache = resolve('src/lessons/seen-cache.ts');
    writeFileSync(
      script,
      `import { commitSeen, openSessionDedup } from ${JSON.stringify(pathToFileURL(seenCache).href)};\n` +
        `const d = openSessionDedup({ explicit: process.argv[2], projectRoot: process.argv[3] });\n` +
        `commitSeen(d, [process.argv[4]]);\n`,
    );
    // node --import tsx, not node_modules/.bin/tsx: Windows has only tsx.cmd there.
    const ids = Array.from({ length: 12 }, (_, i) => `id-${String(i).padStart(2, '0')}`);
    await Promise.all(
      ids.map((id) => run(process.execPath, ['--import', 'tsx', script, session, root, id])),
    );
    expect(seenNow()).toEqual(ids);
  }, 30_000);
});
