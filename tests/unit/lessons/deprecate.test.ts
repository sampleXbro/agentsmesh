import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deprecateLesson } from '../../../src/lessons/deprecate.js';
import {
  UnknownLessonError,
  UnknownSupersederError,
} from '../../../src/lessons/curation-errors.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../src/lessons/graph-store.js';
import { LessonsWriteRefusedError } from '../../../src/lessons/mutate.js';
import { queryLessons } from '../../../src/lessons/query.js';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';
import { graphOf, lesson, rejected } from './lifecycle-test-helpers.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-deprecate-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const errorsOf = (): string[] =>
  validateLessonsGraph(loadLessonsGraph(root))
    .findings.filter((f) => f.level === 'error')
    .map((f) => f.code);
const recalled = (): string[] =>
  queryLessons(loadLessonsGraph(root), { file: 'src/lessons/x.ts' }).map((m) => m.id);

describe('deprecateLesson without a successor', () => {
  it('retires a lesson others were merged into, and its whole lineage with it', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        x: lesson('X.', { status: 'superseded', supersededBy: 'b' }),
        y: lesson('Y.', { status: 'superseded', supersededBy: 'b' }),
        b: lesson('B.'),
        keep: lesson('Keep.'),
      }),
    );
    expect(recalled()).toEqual(['b', 'keep']);

    const result = await deprecateLesson(root, 'b', null);

    expect(result).toEqual({ id: 'b', status: 'deprecated', supersededBy: null });
    const { lessons } = loadLessonsGraph(root);
    expect(lessons['b']?.status).toBe('deprecated');
    expect(lessons['x']).toMatchObject({ status: 'deprecated', supersededBy: 'b' });
    expect(lessons['y']).toMatchObject({ status: 'deprecated', supersededBy: 'b' });
    expect(lessons['keep']?.status).toBe('active');
    expect(errorsOf()).toEqual([]);
    expect(recalled()).toEqual(['keep']);
  });

  it('retires a deeper pre-existing chain too', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        x: lesson('X.', { status: 'superseded', supersededBy: 'a' }),
        a: lesson('A.', { status: 'superseded', supersededBy: 'b' }),
        b: lesson('B.'),
      }),
    );
    await deprecateLesson(root, 'b', null);
    const { lessons } = loadLessonsGraph(root);
    expect(Object.values(lessons).map((l) => l.status)).toEqual([
      'deprecated',
      'deprecated',
      'deprecated',
    ]);
    expect(errorsOf()).toEqual([]);
  });

  it('does not touch unrelated superseded lessons', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        x: lesson('X.', { status: 'superseded', supersededBy: 'other' }),
        other: lesson('Other.'),
        b: lesson('B.'),
      }),
    );
    await deprecateLesson(root, 'b', null);
    expect(loadLessonsGraph(root).lessons['x']).toMatchObject({
      status: 'superseded',
      supersededBy: 'other',
    });
  });
});

describe('deprecateLesson with a successor', () => {
  it('folds lessons superseded by the retired lesson onto the new successor', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        a: lesson('A.', { status: 'superseded', supersededBy: 'b' }),
        b: lesson('B.'),
        c: lesson('C.'),
      }),
    );

    const result = await deprecateLesson(root, 'b', 'c');

    expect(result).toEqual({ id: 'b', status: 'superseded', supersededBy: 'c' });
    const { lessons } = loadLessonsGraph(root);
    expect(lessons['a']).toMatchObject({ status: 'superseded', supersededBy: 'c' });
    expect(lessons['b']).toMatchObject({ status: 'superseded', supersededBy: 'c' });
    expect(errorsOf()).toEqual([]);
    expect(recalled()).toEqual(['c']);
  });

  it('folds a deeper pre-existing chain onto the new successor', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        x: lesson('X.', { status: 'superseded', supersededBy: 'a' }),
        a: lesson('A.', { status: 'superseded', supersededBy: 'b' }),
        b: lesson('B.'),
        c: lesson('C.'),
      }),
    );
    await deprecateLesson(root, 'b', 'c');
    const { lessons } = loadLessonsGraph(root);
    expect(lessons['x']?.supersededBy).toBe('c');
    expect(lessons['a']?.supersededBy).toBe('c');
    expect(errorsOf()).toEqual([]);
  });
});

describe('deprecateLesson still refuses a truly broken chain', () => {
  const refuse = async (id: string, by: string): Promise<LessonsWriteRefusedError> => {
    const before = readFileSync(graphFilePath(root), 'utf8');
    const err = await rejected(deprecateLesson(root, id, by));
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
    expect(err).toBeInstanceOf(LessonsWriteRefusedError);
    return err as LessonsWriteRefusedError;
  };

  beforeEach(() => {
    saveLessonsGraph(
      root,
      graphOf({
        a: lesson('A.'),
        b: lesson('B.'),
        old: lesson('Old.', { status: 'superseded', supersededBy: 'b' }),
        dep: lesson('Dep.', { status: 'deprecated' }),
      }),
    );
  });

  it('a successor that is already deprecated', async () => {
    const err = await refuse('a', 'dep');
    expect(err.findings.map((f) => f.code)).toEqual(['INACTIVE_SUPERSEDER']);
  });

  it('a successor from the retired lineage (a cycle)', async () => {
    const err = await refuse('b', 'old');
    expect([...new Set(err.findings.map((f) => f.code))]).toEqual([
      'INACTIVE_SUPERSEDER',
      'SUPERSEDE_CYCLE',
    ]);
  });

  it('a lesson superseding itself', async () => {
    const err = await refuse('a', 'a');
    expect(err.findings.map((f) => f.code)).toEqual(['SELF_SUPERSEDED']);
  });
});

describe('deprecate errors are typed and keep their message text', () => {
  beforeEach(() => {
    saveLessonsGraph(root, graphOf({ a: lesson('A.') }));
  });

  it('unknown lesson', async () => {
    const err = await rejected(deprecateLesson(root, 'nope', null));
    expect(err).toBeInstanceOf(UnknownLessonError);
    expect(err).toMatchObject({ code: 'UNKNOWN_LESSON', message: 'Unknown lesson: nope.' });
  });

  it('unknown superseder', async () => {
    const err = await rejected(deprecateLesson(root, 'a', 'nope'));
    expect(err).toBeInstanceOf(UnknownSupersederError);
    expect(err).toMatchObject({ code: 'UNKNOWN_SUPERSEDER', message: 'Unknown superseder: nope.' });
  });
});
