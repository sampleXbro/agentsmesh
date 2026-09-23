import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAutoPruneEnabled, maybeAutoPrune } from '../../../src/lessons/auto-prune.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { lessonsPaths } from '../../../src/lessons/paths.js';
import { projectFilesOf } from '../../../src/lessons/project-files.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-autoprune-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** `src/live.ts` on disk and tracked; git history renamed `renamed` paths away. */
function filesWith(renamed: string[]): ReadonlySet<string> {
  return projectFilesOf(['src/live.ts'], () => ({
    tracked: new Set(['src/live.ts']),
    deleted: new Set<string>(),
    renamedAway: new Set(renamed),
  }));
}

function writeConfig(value: unknown): void {
  const path = lessonsPaths(root).config;
  mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
  writeFileSync(path, JSON.stringify(value), 'utf8');
}

/** One active lesson + a dead trigger referenced only by a superseded lesson. */
function graphWithOrphan(): LessonsGraph {
  return {
    version: 1,
    lessons: {
      live: {
        rule: 'Live rule.',
        topics: ['t'],
        triggers: ['t-live'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
      dead: {
        rule: 'Dead rule.',
        topics: ['t'],
        triggers: ['t-orphan'],
        evidence: [],
        status: 'superseded',
        supersededBy: 'live',
        createdAt: '2026-06-01',
      },
    },
    // `gone` is referenced by NO lesson (any status) → an orphan topic.
    topics: { t: { summary: 'T.' }, gone: { summary: 'Orphan topic.' } },
    triggers: {
      't-live': { kind: 'file_glob', pattern: 'src/live.ts' },
      't-orphan': { kind: 'file_glob', pattern: 'src/dead.ts' },
    },
  };
}

describe('isAutoPruneEnabled', () => {
  it('is false when no config file exists', () => {
    expect(isAutoPruneEnabled(root)).toBe(false);
  });

  it('is false unless config.autoPrune === true', () => {
    writeConfig({ recallLimit: 5 });
    expect(isAutoPruneEnabled(root)).toBe(false);
    writeConfig({ autoPrune: false });
    expect(isAutoPruneEnabled(root)).toBe(false);
    writeConfig({ autoPrune: 1 });
    expect(isAutoPruneEnabled(root)).toBe(false);
  });

  it('is true when config.autoPrune === true', () => {
    writeConfig({ autoPrune: true });
    expect(isAutoPruneEnabled(root)).toBe(true);
  });

  it('is false when the config is valid JSON but not an object', () => {
    writeConfig(42);
    expect(isAutoPruneEnabled(root)).toBe(false);
  });

  it('never throws on malformed config (returns false)', () => {
    writeConfig('not json' as unknown);
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(lessonsPaths(root).config, '{ broken', 'utf8');
    expect(isAutoPruneEnabled(root)).toBe(false);
  });
});

describe('maybeAutoPrune', () => {
  it('is a no-op (returns null) when auto-prune is disabled', async () => {
    saveLessonsGraph(root, graphWithOrphan());
    const summary = await maybeAutoPrune(root, undefined);
    expect(summary).toBeNull();
    // The orphan trigger + topic survive — nothing was pruned.
    expect(Object.keys(loadLessonsGraph(root).triggers)).toContain('t-orphan');
  });

  it('returns null when enabled but no graph exists yet (nothing to prune)', async () => {
    writeConfig({ autoPrune: true }); // enabled, but saveLessonsGraph never called
    expect(await maybeAutoPrune(root, undefined)).toBeNull();
  });

  it('GCs orphan triggers and topics when enabled', async () => {
    saveLessonsGraph(root, graphWithOrphan());
    writeConfig({ autoPrune: true });
    const summary = await maybeAutoPrune(root, undefined);
    expect(summary).toEqual({ removedTriggers: 1, removedTopics: 1, detachedDeadGlobs: 0 });
    const graph = loadLessonsGraph(root);
    expect(Object.keys(graph.triggers)).not.toContain('t-orphan');
    expect(Object.keys(graph.topics)).not.toContain('gone');
    // The active lesson and its live trigger are untouched.
    expect(Object.keys(graph.lessons)).toContain('live');
    expect(Object.keys(graph.triggers)).toContain('t-live');
  });

  it('detaches a non-stranding glob that git history renamed away', async () => {
    const graph = graphWithOrphan();
    // Give the active lesson a second, live trigger + a dead glob.
    graph.triggers['t-dead-glob'] = { kind: 'file_glob', pattern: 'src/renamed.ts' };
    graph.lessons['live']!.triggers = ['t-live', 't-dead-glob'];
    saveLessonsGraph(root, graph);
    writeConfig({ autoPrune: true });
    const summary = await maybeAutoPrune(root, filesWith(['src/renamed.ts']));
    expect(summary?.detachedDeadGlobs).toBe(1);
    expect(loadLessonsGraph(root).lessons['live']!.triggers).toEqual(['t-live']);
  });

  it('keeps a glob with no removal proof (pending, or no git evidence) and only GCs orphans', async () => {
    const graph = graphWithOrphan();
    graph.triggers['t-new'] = { kind: 'file_glob', pattern: 'src/api/refunds.ts' };
    graph.lessons['live']!.triggers = ['t-live', 't-new'];
    saveLessonsGraph(root, graph);
    writeConfig({ autoPrune: true });
    for (const known of [filesWith([]), new Set(['src/live.ts'])]) {
      const summary = await maybeAutoPrune(root, known);
      expect(summary?.detachedDeadGlobs ?? 0).toBe(0);
      expect(loadLessonsGraph(root).lessons['live']!.triggers).toEqual(['t-live', 't-new']);
    }
  });

  it('never trims a within-or-over-cap active lesson (GC-only, no trigger drop from a live lesson)', async () => {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        big: {
          rule: 'Big.',
          topics: ['t'],
          triggers: ['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `g${i}`,
          { kind: 'file_glob', pattern: `src/f${i}.ts` },
        ]),
      ),
    };
    saveLessonsGraph(root, graph);
    writeConfig({ autoPrune: true });
    const summary = await maybeAutoPrune(root, undefined);
    // 10 triggers > the cap of 8, but auto-prune does NOT trim — nothing to GC.
    expect(summary).toBeNull();
    expect(loadLessonsGraph(root).lessons['big']!.triggers).toHaveLength(10);
  });
});
