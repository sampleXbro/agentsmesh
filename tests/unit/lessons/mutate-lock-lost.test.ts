/**
 * A writer paused longer than the stale window loses the lessons lock to a
 * later writer. When it resumes it must not save over that writer's graph.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { lessonsLockPath } from '../../../src/lessons/lessons-lock.js';
import { mutateLessonsGraph } from '../../../src/lessons/mutate.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-mutate-lost-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function graphWithTopic(topic: string): LessonsGraph {
  return { version: 2, lessons: {}, topics: { [topic]: { summary: `${topic}.` } }, triggers: {} };
}

/** What a second writer does after evicting this one as stale: take the lock, then save. */
function secondWriterTakesOver(): void {
  const lock = lessonsLockPath(root);
  rmSync(lock, { recursive: true, force: true });
  mkdirSync(join(lock, 'owner-second'), { recursive: true });
  const holder = { pid: process.pid, started: Date.now(), token: 'second' };
  writeFileSync(join(lock, 'holder.json'), JSON.stringify(holder));
  saveLessonsGraph(root, graphWithTopic('second'));
}

describe('mutateLessonsGraph — lock lost while writing', () => {
  it('refuses to save and keeps the later writer graph', async () => {
    saveLessonsGraph(root, graphWithTopic('seed'));

    const outcome = mutateLessonsGraph(root, (g) => {
      secondWriterTakesOver();
      g.topics['stalled'] = { summary: 'Stalled.' };
    });

    await expect(outcome).rejects.toThrow(
      'lost the lessons lock while writing (the process was paused longer than the 60 s ' +
        'stale window?); nothing was saved — retry the command',
    );
    expect(Object.keys(loadLessonsGraph(root).topics)).toEqual(['second']);
    // The later writer's lock is left in place for it to release.
    expect(existsSync(join(lessonsLockPath(root), 'owner-second'))).toBe(true);
  });

  it('saves normally while the lock is still held', async () => {
    saveLessonsGraph(root, graphWithTopic('seed'));
    await mutateLessonsGraph(root, (g) => {
      g.topics['kept'] = { summary: 'Kept.' };
    });
    expect(Object.keys(loadLessonsGraph(root).topics).sort()).toEqual(['kept', 'seed']);
  });
});
