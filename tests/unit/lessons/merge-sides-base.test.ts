import { describe, expect, it } from 'vitest';
import type { Lesson } from '../../../src/lessons/graph-schema.js';
import {
  describeUnreadableBase,
  parseGraphText,
  unionGraphTexts,
} from '../../../src/lessons/merge-sides.js';

const BOM = '\uFEFF';
const lesson = (rule: string): Lesson => ({
  rule,
  topics: ['t'],
  triggers: [],
  evidence: [],
  status: 'active',
  createdAt: '2026-06-01',
});
const text = (lessons: Record<string, Lesson>, version = 2): string =>
  JSON.stringify({ version, lessons, topics: { t: { summary: 'T.' } }, triggers: {} });

describe('a UTF-8 BOM in front of a graph', () => {
  it('is skipped by parseGraphText', () => {
    const r = parseGraphText(`${BOM}${text({ a: lesson('A.') })}`);
    expect(r.ok && Object.keys(r.graph.lessons)).toEqual(['a']);
  });

  it('does not make unionGraphTexts give up on any of the three texts', () => {
    const r = unionGraphTexts(
      `${BOM}${text({ l0: lesson('Base.') })}`,
      `${BOM}${text({ a: lesson('A.'), l0: lesson('Base.') })}`,
      `${BOM}${text({ b: lesson('B.'), l0: lesson('Base.') })}`,
    );
    if (!r.ok) throw new Error(`expected a union, got ${r.detail}`);
    expect(Object.keys(r.merged.lessons).sort()).toEqual(['a', 'b', 'l0']);
    expect(r.baseUnreadable).toBeUndefined();
  });
});

describe('unionGraphTexts — a base that cannot be read', () => {
  const ours = text({ a: lesson('A.') });
  const theirs = text({ b: lesson('B.') });

  it.each([null, '', '  \n'])('says nothing about an absent or blank base (%j)', (base) => {
    const r = unionGraphTexts(base, ours, theirs);
    if (!r.ok) throw new Error('expected a union');
    expect(r.baseUnreadable).toBeUndefined();
  });

  it('keeps the union and reports a base that is not JSON', () => {
    const r = unionGraphTexts('{ not json', ours, theirs);
    if (!r.ok) throw new Error('expected a union');
    expect(Object.keys(r.merged.lessons).sort()).toEqual(['a', 'b']);
    expect(r.baseUnreadable).toMatch(/JSON|token|position/i);
  });

  it('reports a base written by a newer schema version', () => {
    const r = unionGraphTexts(text({}, 9), ours, theirs);
    if (!r.ok) throw new Error('expected a union');
    expect(r.baseUnreadable).toBe('schema version 9');
  });

  it('reports a base that fails the schema', () => {
    const r = unionGraphTexts(
      '{"version":2,"lessons":"x","topics":{},"triggers":{}}',
      ours,
      theirs,
    );
    if (!r.ok) throw new Error('expected a union');
    expect(r.baseUnreadable).toContain('lessons');
  });

  it('is not reported when ours or theirs is the unreadable one', () => {
    expect(unionGraphTexts(text({}), '{ nope', theirs)).toMatchObject({ ok: false, side: 'ours' });
  });
});

describe('describeUnreadableBase', () => {
  it('names the file, the cause and what may come back', () => {
    expect(describeUnreadableBase('schema version 9')).toBe(
      'The common ancestor of .agentsmesh/lessons/lessons.json could not be read ' +
        '(schema version 9), so it was treated as empty. Both branches were combined and no ' +
        'lesson was lost, but a trigger or topic that one branch deleted may be back. Check ' +
        'with `agentsmesh lessons validate`.',
    );
  });
});
