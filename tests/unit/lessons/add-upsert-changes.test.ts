import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLesson, type AddLessonInput } from '../../../src/lessons/add.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-add-upsert-'));
  const seed: LessonsGraph = {
    version: 2,
    lessons: {
      'c-seed': {
        rule: 'seed',
        topics: ['c'],
        triggers: ['t-a'],
        evidence: [],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
    topics: { c: { summary: 'C.' }, ci: { summary: 'CI.' } },
    triggers: {
      't-a': { kind: 'file_glob', pattern: 'src/a.ts' },
      't-b': { kind: 'file_glob', pattern: 'src/b.ts' },
    },
  };
  saveLessonsGraph(root, seed);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const reAdd = (extra: Partial<AddLessonInput> = {}): ReturnType<typeof addLesson> =>
  addLesson(root, { rule: 'seed', topic: 'c', triggers: { files: ['src/a.ts'] }, ...extra });

describe('addLesson upsert — reports what changed', () => {
  it('reports no change for an identical re-add', async () => {
    const r = await reAdd();
    expect(r.isNewLesson).toBe(false);
    expect(r.changes).toEqual([]);
  });

  it('reports a scope promotion to always', async () => {
    const r = await reAdd({ scope: 'always' });
    expect(r.changes).toEqual(['scope set to always']);
    expect(loadLessonsGraph(root).lessons['c-seed']?.scope).toBe('always');
  });

  it('reports a topic merged in', async () => {
    const r = await reAdd({ topic: 'ci' });
    expect(r.changes).toEqual(['topic added: ci']);
  });

  it('reports evidence and a rationale added', async () => {
    const r = await reAdd({ evidence: ['commit:abc'], rationale: 'Why.' });
    expect(r.changes).toEqual(['evidence added: commit:abc', 'rationale added']);
  });

  it('reports no change when only a different rationale is passed (the first one is kept)', async () => {
    await reAdd({ rationale: 'First.' });
    const r = await reAdd({ rationale: 'Second.' });
    expect(r.changes).toEqual([]);
  });

  it('reports an existing trigger node attached (newTriggerIds stays empty)', async () => {
    const r = await reAdd({ triggers: { files: ['src/b.ts'] } });
    expect(r.newTriggerIds).toEqual([]);
    expect(r.changes).toEqual(['trigger attached: t-b']);
  });

  it('reports a new trigger node attached', async () => {
    const r = await reAdd({ triggers: { files: ['src/c.ts'] } });
    expect(r.newTriggerIds).toHaveLength(1);
    expect(r.changes).toEqual([`trigger attached: ${r.newTriggerIds[0]!}`]);
  });

  it('pluralizes several triggers attached at once', async () => {
    const r = await reAdd({ triggers: { files: ['src/b.ts', 'src/c.ts'] } });
    expect(r.changes).toEqual([`triggers attached: t-b, ${r.newTriggerIds[0]!}`]);
  });

  it('lists every change in a fixed order', async () => {
    const r = await reAdd({
      topic: 'ci',
      triggers: { files: ['src/a.ts', 'src/b.ts'] },
      evidence: ['commit:abc', 'lesson:x'],
      rationale: 'Why.',
      scope: 'always',
    });
    expect(r.changes).toEqual([
      'scope set to always',
      'topic added: ci',
      'trigger attached: t-b',
      'evidence added: commit:abc, lesson:x',
      'rationale added',
    ]);
  });

  it('reports no changes for a new lesson', async () => {
    const r = await addLesson(root, {
      rule: 'Another rule.',
      topic: 'c',
      triggers: { files: ['src/a.ts'] },
    });
    expect(r.isNewLesson).toBe(true);
    expect(r.changes).toEqual([]);
  });
});
