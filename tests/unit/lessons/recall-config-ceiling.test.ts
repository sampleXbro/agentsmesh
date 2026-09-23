import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { recallLessons } from '../../../src/lessons/recall.js';
import {
  lessonsConfigWarning,
  loadRecallConfig,
  MAX_RECALL_LIMIT,
  MAX_RECALL_MAX_TOKENS,
} from '../../../src/lessons/recall-config.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recall-ceiling-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(value: unknown): void {
  mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh/lessons/config.json'), JSON.stringify(value));
}

describe('recall config ceilings (a committed config.json cannot inflate injection)', () => {
  it('uses ceilings of 50 lessons and 8000 tokens', () => {
    expect(MAX_RECALL_LIMIT).toBe(50);
    expect(MAX_RECALL_MAX_TOKENS).toBe(8000);
  });

  it('clamps huge values to the ceilings', () => {
    writeConfig({ recallLimit: 100_000, recallMaxTokens: 100_000_000 });
    expect(loadRecallConfig(root)).toEqual({
      limit: MAX_RECALL_LIMIT,
      maxTokens: MAX_RECALL_MAX_TOKENS,
    });
  });

  it('keeps values at or below the ceilings unchanged', () => {
    writeConfig({ recallLimit: MAX_RECALL_LIMIT, recallMaxTokens: 250 });
    expect(loadRecallConfig(root)).toEqual({ limit: MAX_RECALL_LIMIT, maxTokens: 250 });
  });

  it('warns when a value is clamped', () => {
    writeConfig({ recallLimit: 100_000, recallMaxTokens: 100_000_000 });
    expect(lessonsConfigWarning(root)).toBe(
      'lessons config.json sets recallLimit above 50 and recallMaxTokens above 8000 — clamped to the ceiling.',
    );
  });

  it('warns for a single clamped field', () => {
    writeConfig({ recallLimit: 5, recallMaxTokens: 9000 });
    expect(lessonsConfigWarning(root)).toBe(
      'lessons config.json sets recallMaxTokens above 8000 — clamped to the ceiling.',
    );
  });

  it('does not warn for values within the ceilings', () => {
    writeConfig({ recallLimit: 50, recallMaxTokens: 8000 });
    expect(lessonsConfigWarning(root)).toBeNull();
  });

  it('caps what recallLessons injects even when config asks for everything', async () => {
    const ids = Array.from({ length: 80 }, (_, i) => `lesson-${String(i).padStart(2, '0')}`);
    const graph: LessonsGraph = {
      version: 2,
      lessons: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            rule: `Rule ${id} ${'detail '.repeat(40)}`,
            topics: ['t'],
            triggers: ['t-src'],
            evidence: [],
            status: 'active' as const,
            createdAt: '2026-06-01',
          },
        ]),
      ),
      topics: { t: { summary: 'T.' } },
      triggers: { 't-src': { kind: 'file_glob', pattern: 'src/**' } },
    };
    saveLessonsGraph(root, graph);
    writeConfig({ recallLimit: 100_000, recallMaxTokens: 100_000_000 });
    const result = await recallLessons(root, { file: 'src/x.ts' }, { noDedup: true });
    const injectedChars = result.lessons.reduce((n, l) => n + l.lesson.rule.length, 0);
    expect(result.lessons.length).toBeLessThanOrEqual(MAX_RECALL_LIMIT);
    expect(injectedChars).toBeLessThanOrEqual(MAX_RECALL_MAX_TOKENS * 4);
  });
});
