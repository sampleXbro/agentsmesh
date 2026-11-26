import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InactiveLessonError,
  SelfMergeError,
  UnknownLessonError,
} from '../../../src/lessons/curation-errors.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { mergeLessons } from '../../../src/lessons/merge.js';
import { collectAlwaysLessons, queryLessons } from '../../../src/lessons/query.js';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';
import { graphOf, lesson, rejected } from './lifecycle-test-helpers.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-merge-life-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('mergeLessons keeps the always-on scope', () => {
  it('promotes the keeper when only the loser is always-on', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        always: lesson('Universal rule.', { scope: 'always', triggers: [] }),
        keeper: lesson('Triggered rule.'),
      }),
    );
    await mergeLessons(root, 'always', 'keeper');

    const graph = loadLessonsGraph(root);
    expect(graph.lessons['keeper']?.scope).toBe('always');
    expect(graph.lessons['always']).toMatchObject({ status: 'superseded', supersededBy: 'keeper' });
    expect(collectAlwaysLessons(graph).map((m) => m.id)).toEqual(['keeper']);
  });

  it('keeps an always-on keeper always-on', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        keeper: lesson('Universal rule.', { scope: 'always', triggers: [] }),
        loser: lesson('Triggered rule.'),
      }),
    );
    await mergeLessons(root, 'loser', 'keeper');
    expect(collectAlwaysLessons(loadLessonsGraph(root)).map((m) => m.id)).toEqual(['keeper']);
  });

  it('adds no scope when neither lesson is always-on', async () => {
    saveLessonsGraph(root, graphOf({ keeper: lesson('One.'), loser: lesson('Two.') }));
    await mergeLessons(root, 'loser', 'keeper');
    expect(loadLessonsGraph(root).lessons['keeper']).not.toHaveProperty('scope');
  });
});

describe('mergeLessons keeps the loser rationale and the earlier date', () => {
  it('carries the loser rationale when the keeper has none', async () => {
    saveLessonsGraph(
      root,
      graphOf({ keeper: lesson('One.'), loser: lesson('Two.', { rationale: 'Because.' }) }),
    );
    await mergeLessons(root, 'loser', 'keeper');
    expect(loadLessonsGraph(root).lessons['keeper']?.rationale).toBe('Because.');
  });

  it('keeps the keeper rationale when both have one', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        keeper: lesson('One.', { rationale: 'Keeper why.' }),
        loser: lesson('Two.', { rationale: 'Loser why.' }),
      }),
    );
    await mergeLessons(root, 'loser', 'keeper');
    expect(loadLessonsGraph(root).lessons['keeper']?.rationale).toBe('Keeper why.');
  });

  it.each([
    ['the loser is older', '2026-03-01', '2026-01-01', '2026-01-01'],
    ['the keeper is older', '2026-01-01', '2026-03-01', '2026-01-01'],
    ['a datetime ties a date', '2026-01-01T10:00:00Z', '2026-01-01', '2026-01-01'],
  ])('createdAt is the earlier date when %s', async (_label, keeperAt, loserAt, expected) => {
    saveLessonsGraph(
      root,
      graphOf({
        keeper: lesson('One.', { createdAt: keeperAt }),
        loser: lesson('Two.', { createdAt: loserAt }),
      }),
    );
    await mergeLessons(root, 'loser', 'keeper');
    expect(loadLessonsGraph(root).lessons['keeper']?.createdAt).toBe(expected);
  });
});

describe('mergeLessons folds supersede chains', () => {
  it('re-points lessons merged earlier into the loser at the new keeper', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        a: lesson('A.', { status: 'superseded', supersededBy: 'b' }),
        b: lesson('B.'),
        c: lesson('C.'),
      }),
    );
    await mergeLessons(root, 'b', 'c');

    const graph = loadLessonsGraph(root);
    expect(graph.lessons['a']).toMatchObject({ status: 'superseded', supersededBy: 'c' });
    expect(graph.lessons['b']).toMatchObject({ status: 'superseded', supersededBy: 'c' });
    expect(validateLessonsGraph(graph).findings.filter((f) => f.level === 'error')).toEqual([]);
    expect(queryLessons(graph, { file: 'src/lessons/x.ts' }).map((m) => m.id)).toEqual(['c']);
  });

  it('leaves lessons that point elsewhere alone', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        a: lesson('A.', { status: 'superseded', supersededBy: 'other' }),
        other: lesson('Other.'),
        b: lesson('B.'),
        c: lesson('C.'),
      }),
    );
    await mergeLessons(root, 'b', 'c');
    expect(loadLessonsGraph(root).lessons['a']?.supersededBy).toBe('other');
  });

  it('folds a whole earlier chain (A to B to C) onto the new keeper', async () => {
    saveLessonsGraph(
      root,
      graphOf({
        a: lesson('A.', { status: 'superseded', supersededBy: 'b' }),
        b: lesson('B.', { status: 'superseded', supersededBy: 'c' }),
        c: lesson('C.'),
        d: lesson('D.'),
      }),
    );
    await mergeLessons(root, 'c', 'd');

    const graph = loadLessonsGraph(root);
    expect(graph.lessons['a']?.supersededBy).toBe('d');
    expect(graph.lessons['b']?.supersededBy).toBe('d');
    expect(graph.lessons['c']?.supersededBy).toBe('d');
  });
});

describe('merge errors are typed and keep their message text', () => {
  beforeEach(() => {
    saveLessonsGraph(
      root,
      graphOf({
        keeper: lesson('One.'),
        loser: lesson('Two.'),
        dep: lesson('Dep.', { status: 'deprecated' }),
      }),
    );
  });

  it('self merge', async () => {
    const err = await rejected(mergeLessons(root, 'keeper', 'keeper'));
    expect(err).toBeInstanceOf(SelfMergeError);
    expect(err).toMatchObject({
      code: 'SELF_MERGE',
      message: 'Cannot merge lesson "keeper" into itself.',
    });
  });

  it.each([
    ['loser', 'ghost', 'keeper'],
    ['keeper', 'loser', 'ghost'],
  ])('unknown %s', async (_role, loserId, keeperId) => {
    const err = await rejected(mergeLessons(root, loserId, keeperId));
    expect(err).toBeInstanceOf(UnknownLessonError);
    expect(err).toMatchObject({ code: 'UNKNOWN_LESSON', message: 'Unknown lesson "ghost".' });
  });

  it('inactive keeper', async () => {
    const err = await rejected(mergeLessons(root, 'loser', 'dep'));
    expect(err).toBeInstanceOf(InactiveLessonError);
    expect(err).toMatchObject({
      code: 'INACTIVE_LESSON',
      message: 'Keeper "dep" is not active (status: deprecated).',
    });
  });

  it('inactive loser', async () => {
    const err = await rejected(mergeLessons(root, 'dep', 'keeper'));
    expect(err).toBeInstanceOf(InactiveLessonError);
    expect(err).toMatchObject({
      code: 'INACTIVE_LESSON',
      message: 'Loser "dep" is already deprecated; nothing to merge.',
    });
  });
});
