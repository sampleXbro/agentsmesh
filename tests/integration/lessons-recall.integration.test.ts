/**
 * Integration: the migration-aware application APIs `recallLessons` and
 * `captureLesson` (src/lessons/recall.ts).
 *
 * These close the public-API gap the review flagged: the low-level primitives
 * (`tryLoadLessonsGraph`, `mutateLessonsGraph`) do NOT migrate a legacy store,
 * so a first read/write through them would strand `index.yaml`. The blessed
 * application APIs migrate first.
 */

import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLesson } from '../../src/lessons/capture.js';
import { recallLessons } from '../../src/lessons/recall.js';
import { mutateLessonsGraph } from '../../src/lessons/mutate.js';
import { tryLoadLessonsGraph } from '../../src/lessons/graph-store.js';
import { lessonsPaths } from '../../src/lessons/paths.js';
import { DEFAULT_RECALL_MAX_TOKENS } from '../../src/lessons/ranking.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../fixtures/lessons/legacy-input');

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lessons-recall-'));
});

afterEach(() => {
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

function stageLegacy(): void {
  cpSync(FIXTURE, join(root, '.agentsmesh', 'lessons'), { recursive: true });
}

describe('recallLessons', () => {
  it('migrates a legacy store on first read so it is never stranded', () => {
    stageLegacy();
    // Sanity: the low-level primitive does NOT migrate — it would strand legacy.
    expect(tryLoadLessonsGraph(root)).toBeNull();

    return recallLessons(root, { keyword: 'alpha' }).then((result) => {
      // Legacy index consumed, JSON graph written, lessons recalled.
      expect(existsSync(lessonsPaths(root).index)).toBe(false);
      expect(existsSync(lessonsPaths(root).graph)).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.lessons.length).toBeGreaterThan(0);
    });
  });

  it('returns empty (not an error) when no graph and no legacy store exist', async () => {
    const result = await recallLessons(root, { keyword: 'anything' });
    expect(result).toEqual({ lessons: [], totalMatches: 0, suppressed: 0 });
  });

  it('degrades to empty + corrupt flag instead of throwing on an unreadable graph', async () => {
    // Recall is a BLOCKING REQUIREMENT before every edit/command — a corrupt
    // canonical graph must NOT crash the workflow with a stack trace.
    const graphPath = lessonsPaths(root).graph;
    cpSync(FIXTURE, join(root, '.agentsmesh', 'lessons'), { recursive: true }); // ensure dir
    rmSync(graphPath, { force: true });
    writeFileSync(graphPath, '{ truncated', 'utf8');
    const result = await recallLessons(root, { keyword: 'anything' });
    expect(result.lessons).toEqual([]);
    expect(result.totalMatches).toBe(0);
    expect(result.corrupt).toBe(true);
  });

  it('matches a file_glob lesson when --file is passed as an absolute path', async () => {
    await captureLesson(
      root,
      { rule: 'A lesson under src.', topic: 'paths', triggers: { files: ['src/**/*.ts'] } },
      { allowNewTopic: true, topicSummary: 'Paths topic' },
    );
    const abs = join(root, 'src', 'lessons', 'query.ts');
    const result = await recallLessons(root, { file: abs }, { maxTokens: null });
    expect(result.lessons.map((l) => l.lesson.rule)).toEqual(['A lesson under src.']);
  });

  it('matches a file_glob lesson when --file is a ./-prefixed relative path', async () => {
    await captureLesson(
      root,
      { rule: 'A dotslash lesson.', topic: 'paths', triggers: { files: ['src/**/*.ts'] } },
      { allowNewTopic: true, topicSummary: 'Paths topic' },
    );
    const result = await recallLessons(
      root,
      { file: './src/lessons/query.ts' },
      { maxTokens: null },
    );
    expect(result.lessons.map((l) => l.lesson.rule)).toEqual(['A dotslash lesson.']);
  });

  it('applies the default token budget, and maxTokens:null disables it', async () => {
    // Seed many distinct LONG lessons under one shared keyword trigger so the
    // token budget — not the default limit — is what trims the result.
    const filler =
      `${'word '.repeat(Math.ceil((DEFAULT_RECALL_MAX_TOKENS * 2) / 15)).trim()}`.trim(); // scales with the default budget
    for (let i = 0; i < 20; i++) {
      await captureLesson(
        root,
        {
          rule: `Budget lesson number ${i} ${filler}`,
          topic: 'budget',
          triggers: { keywords: ['budgetkw'] },
        },
        { allowNewTopic: true, topicSummary: 'Budget topic' },
      );
    }
    const def = await recallLessons(root, { keyword: 'budgetkw' });
    const unlimited = await recallLessons(
      root,
      { keyword: 'budgetkw' },
      { maxTokens: null, limit: 100 },
    );
    const tiny = await recallLessons(root, { keyword: 'budgetkw' }, { maxTokens: 80, limit: 100 });
    // An explicit small budget keeps only the top result (each rule > 80 tokens).
    expect(tiny.lessons.length).toBe(1);
    expect(def.totalMatches).toBe(20);
    // The default budget trims BELOW the default 10-result limit, proving the
    // budget is what bound the result, not the limit.
    expect(def.lessons.length).toBeLessThan(10);
    // An explicit null budget (with a high limit) returns the whole match set.
    expect(unlimited.lessons.length).toBe(20);
  });
});

describe('mutateLessonsGraph (raw public write path)', () => {
  it('migrates a legacy store on a first raw mutation — never strands index.yaml', async () => {
    stageLegacy();
    // The reviewer probe: a first RAW mutation must NOT create an empty graph
    // over the legacy store. mutateLessonsGraph migrates before mutating.
    await mutateLessonsGraph(root, () => {
      /* no-op edit */
    });
    expect(existsSync(lessonsPaths(root).index)).toBe(false);
    const graph = tryLoadLessonsGraph(root);
    expect(graph).not.toBeNull();
    expect(Object.keys(graph!.lessons).length).toBeGreaterThan(0);
    // Recall then surfaces the migrated legacy lessons (not zero).
    const recalled = await recallLessons(root, { keyword: 'alpha' }, { maxTokens: null });
    expect(recalled.totalMatches).toBeGreaterThan(0);
  });
});

describe('captureLesson', () => {
  it('migrates a legacy store before adding, preserving legacy lessons', async () => {
    stageLegacy();
    const result = await captureLesson(
      root,
      { rule: 'A freshly captured rule', topic: 'alpha-rules', triggers: { keywords: ['fresh'] } },
      {},
    );
    expect(result.isNewLesson).toBe(true);
    expect(existsSync(lessonsPaths(root).index)).toBe(false);

    const graph = tryLoadLessonsGraph(root);
    expect(graph).not.toBeNull();
    // Legacy lessons (migrated) plus the freshly captured one coexist.
    const recalled = await recallLessons(root, { keyword: 'alpha' }, { maxTokens: null });
    expect(recalled.totalMatches).toBeGreaterThan(0);
  });
});
