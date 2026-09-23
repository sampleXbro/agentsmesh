/**
 * `lessons resolve` writes the combined graph under the lessons lock. If the
 * process lost that lock before saving (paused past the stale window), it must
 * not overwrite what the new holder saved.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphFilePath } from '../../../src/lessons/graph-store.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import { writeGraphText } from '../../helpers/lessons-graph-fixture.js';
import { TWO_CAPTURES } from '../../helpers/lessons-merge-repo.js';

vi.mock('../../../src/lessons/lessons-lock.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lessons/lessons-lock.js')>();
  const lostLock = Object.assign(async (): Promise<void> => {}, {
    isHeld: async (): Promise<boolean> => false,
  });
  return { ...actual, acquireLessonsLock: async () => lostLock };
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-resolve-lost-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const markers = (ours: string, theirs: string): string =>
  [
    '<'.repeat(7) + ' ours',
    ours.trimEnd(),
    '='.repeat(7),
    theirs.trimEnd(),
    '>'.repeat(7) + ' theirs',
    '',
  ].join('\n');

describe('resolveLessonsConflict — lock lost before saving', () => {
  it('saves nothing and says the lock was lost', async () => {
    const conflicted = markers(TWO_CAPTURES.ours, TWO_CAPTURES.theirs);
    writeGraphText(root, conflicted);
    const outcome = await resolveLessonsConflict(root);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/lost the lessons lock/);
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(conflicted);
  });
});
