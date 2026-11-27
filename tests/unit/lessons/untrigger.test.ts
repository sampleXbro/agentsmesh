import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import {
  LastTriggerError,
  TriggerNotAttachedError,
  UnknownLessonError,
} from '../../../src/lessons/curation-errors.js';
import { untriggerLesson } from '../../../src/lessons/untrigger.js';
import { thrown } from './lifecycle-test-helpers.js';

function graph(): LessonsGraph {
  return {
    version: 1,
    lessons: {
      a: {
        rule: 'Rule A.',
        topics: ['t'],
        triggers: ['t-glob', 't-kw-long'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
      b: {
        rule: 'Rule B.',
        topics: ['t'],
        triggers: ['t-glob'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: {
      't-glob': { kind: 'file_glob', pattern: 'src/**/*.ts' },
      't-kw-long': { kind: 'keyword', pattern: 'one two three four five six seven' },
    },
  };
}

describe('untriggerLesson', () => {
  it('removes the trigger reference from the lesson', () => {
    const g = graph();
    const r = untriggerLesson(g, 'a', 't-kw-long');
    expect(g.lessons.a.triggers).toEqual(['t-glob']);
    expect(r).toMatchObject({ lessonId: 'a', triggerId: 't-kw-long', remainingTriggerCount: 1 });
  });

  it('garbage-collects the trigger node when no lesson references it anymore', () => {
    const g = graph();
    const r = untriggerLesson(g, 'a', 't-kw-long');
    expect(g.triggers['t-kw-long']).toBeUndefined();
    expect(r.removedTriggerNode).toBe(true);
  });

  it('keeps the trigger node when another lesson still references it', () => {
    const g = graph();
    const r = untriggerLesson(g, 'a', 't-glob'); // b still references t-glob
    expect(g.triggers['t-glob']).toBeDefined();
    expect(r.removedTriggerNode).toBe(false);
  });

  it('throws on an unknown lesson', () => {
    expect(() => untriggerLesson(graph(), 'ghost', 't-glob')).toThrow(/unknown lesson/i);
  });

  it('throws when the lesson does not reference the trigger', () => {
    expect(() => untriggerLesson(graph(), 'b', 't-kw-long')).toThrow(/does not reference/i);
  });

  it('refuses to remove the only trigger of an active lesson (would be unreachable)', () => {
    expect(() => untriggerLesson(graph(), 'b', 't-glob')).toThrow(/only trigger|unreachable/i);
  });

  it('allows removing the last trigger of an inactive lesson', () => {
    const g = graph();
    g.lessons.b.status = 'deprecated';
    const r = untriggerLesson(g, 'b', 't-glob');
    expect(g.lessons.b.triggers).toEqual([]);
    // t-glob is still referenced by active lesson a, so the node survives.
    expect(r.removedTriggerNode).toBe(false);
  });
});

describe('untriggerLesson on an always-on lesson', () => {
  it('allows removing the last trigger, since an always-on lesson needs none', () => {
    const g = graph();
    g.lessons.b.scope = 'always';
    const r = untriggerLesson(g, 'b', 't-glob');
    expect(g.lessons.b.triggers).toEqual([]);
    expect(g.lessons.b.status).toBe('active');
    expect(r).toMatchObject({ lessonId: 'b', remainingTriggerCount: 0, removedTriggerNode: false });
  });
});

describe('untrigger errors are typed and keep their message text', () => {
  it('unknown lesson', () => {
    const err = thrown(() => untriggerLesson(graph(), 'ghost', 't-glob'));
    expect(err).toBeInstanceOf(UnknownLessonError);
    expect(err).toMatchObject({ code: 'UNKNOWN_LESSON', message: 'Unknown lesson: ghost.' });
  });

  it('a trigger the lesson does not reference', () => {
    const err = thrown(() => untriggerLesson(graph(), 'b', 't-kw-long'));
    expect(err).toBeInstanceOf(TriggerNotAttachedError);
    expect(err).toMatchObject({
      code: 'TRIGGER_NOT_ATTACHED',
      message: 'Lesson "b" does not reference trigger "t-kw-long".',
    });
  });

  it('the only trigger of a triggered lesson', () => {
    const err = thrown(() => untriggerLesson(graph(), 'b', 't-glob'));
    expect(err).toBeInstanceOf(LastTriggerError);
    expect(err).toMatchObject({ code: 'LAST_TRIGGER' });
    expect((err as Error).message).toBe(
      'Refusing to remove the only trigger of active lesson "b" — it would become unreachable. Add a replacement trigger first (lessons add "<same rule>" --topic ...), then untrigger.',
    );
  });
});
