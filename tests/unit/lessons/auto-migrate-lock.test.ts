import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maybeAutoMigrateLessons } from '../../../src/lessons/auto-migrate.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { acquireLessonsLock } from '../../../src/lessons/lessons-lock.js';

const LEGACY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/lessons/legacy-input',
);

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-automig-lock-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('maybeAutoMigrateLessons — graph existence is checked under the lessons lock', () => {
  it('refuses when another writer creates the graph while it waits for the lock', async () => {
    cpSync(LEGACY, join(root, '.agentsmesh/lessons'), { recursive: true });
    const release = await acquireLessonsLock(root);
    const pending = maybeAutoMigrateLessons(root);
    await sleep(50);
    // Another first writer (e.g. a scaffold) lands an EMPTY graph first.
    saveLessonsGraph(root, { version: 2, lessons: {}, topics: {}, triggers: {} });
    await release();
    expect(await pending).toBe(false);
    expect(loadLessonsGraph(root)).toEqual({ version: 2, lessons: {}, topics: {}, triggers: {} });
    expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(true);
  });

  it('lets exactly one of two concurrent first writers migrate', async () => {
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    // An empty legacy index migrates to an empty graph — the case the old
    // "populated?" re-check could not tell apart from "nothing written yet".
    writeFileSync(
      join(root, '.agentsmesh/lessons/index.yaml'),
      'version: 1\nclusters: []\n',
      'utf8',
    );
    const results = await Promise.all([
      maybeAutoMigrateLessons(root),
      maybeAutoMigrateLessons(root),
    ]);
    expect(results.filter(Boolean)).toEqual([true]);
    expect(existsSync(join(root, '.agentsmesh/lessons/lessons.json'))).toBe(true);
  });

  it('two concurrent migrations of real content never throw and migrate once', async () => {
    cpSync(LEGACY, join(root, '.agentsmesh/lessons'), { recursive: true });
    const results = await Promise.all([
      maybeAutoMigrateLessons(root),
      maybeAutoMigrateLessons(root),
    ]);
    expect(results.filter(Boolean)).toEqual([true]);
    expect(Object.keys(loadLessonsGraph(root).lessons)).toHaveLength(5);
    expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(false);
  });
});
