import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Lesson } from '../../../src/lessons/graph-schema.js';
import {
  describeUnreadableSide,
  parseGraphText,
  unionGraphTexts,
} from '../../../src/lessons/merge-sides.js';
import { wholeFileConflict, writeTextualMerge } from '../../../src/lessons/textual-merge.js';

const lesson = (rule: string, over: Partial<Lesson> = {}): Lesson => ({
  rule,
  topics: ['t'],
  triggers: [],
  evidence: [],
  status: 'active',
  createdAt: '2026-06-01',
  ...over,
});
const text = (lessons: Record<string, Lesson>): string =>
  JSON.stringify({ version: 2, lessons, topics: { t: { summary: 'T.' } }, triggers: {} });

describe('parseGraphText', () => {
  it('reports invalid JSON, a schema failure, and a newer schema version apart', () => {
    expect(parseGraphText('{ nope')).toMatchObject({ ok: false });
    const schema = parseGraphText('{"version":2,"lessons":"x","topics":{},"triggers":{}}');
    expect(schema.ok === false && schema.detail).toContain('lessons');
    expect(parseGraphText('{"version":7}')).toEqual({
      ok: false,
      detail: 'schema version 7',
      newerVersion: 7,
    });
  });
});

describe('unionGraphTexts', () => {
  it('treats an absent side as an empty graph and keeps the other side', () => {
    const r = unionGraphTexts(null, null, text({ a: lesson('A.') }));
    expect(r.ok && Object.keys(r.merged.lessons)).toEqual(['a']);
  });

  it('names the unreadable side, ours first', () => {
    const r = unionGraphTexts('', 'bad', 'worse');
    expect(r).toMatchObject({ ok: false, side: 'ours' });
    expect(unionGraphTexts('', text({}), 'bad')).toMatchObject({ ok: false, side: 'theirs' });
  });

  it('lists only the validation errors the merge itself introduced', () => {
    const base = text({ a: lesson('A.'), b: lesson('B.') });
    const ours = text({
      a: lesson('A.', { status: 'superseded', supersededBy: 'b' }),
      b: lesson('B.'),
    });
    const theirs = text({ a: lesson('A.'), b: lesson('B.', { status: 'deprecated' }) });
    const r = unionGraphTexts(base, ours, theirs);
    if (!r.ok) throw new Error('expected a merge');
    expect(r.introduced).toHaveLength(1);
    expect(r.introduced[0]).toContain('"a"');
  });
});

describe('describeUnreadableSide', () => {
  it('asks for an upgrade for a newer schema and names lessons.json', () => {
    const msg = describeUnreadableSide({
      ok: false,
      side: 'theirs',
      detail: 'schema version 9',
      newerVersion: 9,
    });
    expect(msg).toBe(
      '.agentsmesh/lessons/lessons.json on the incoming branch uses lessons schema version 9, ' +
        'newer than this agentsmesh supports (2). Upgrade agentsmesh, then run `agentsmesh lessons resolve`.',
    );
  });

  it('explains an invalid side', () => {
    expect(describeUnreadableSide({ ok: false, side: 'ours', detail: 'boom' })).toBe(
      '.agentsmesh/lessons/lessons.json on this branch is not a valid lessons graph (boom), ' +
        'so the two sides cannot be combined automatically.',
    );
  });
});

describe('writeTextualMerge', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'am-textual-merge-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('falls back to one whole-file conflict block when git cannot run', () => {
    const [base, ours, theirs] = ['base', 'ours', 'theirs'].map((n) => join(dir, n));
    writeFileSync(base!, '');
    writeFileSync(ours!, 'mine');
    writeFileSync(theirs!, 'yours\n');
    writeTextualMerge(base!, ours!, theirs!, () => ({ status: -1, stdout: '', stderr: '' }));
    expect(readFileSync(ours!, 'utf8')).toBe(
      '<<<<<<< this branch\nmine\n=======\nyours\n>>>>>>> incoming branch\n',
    );
  });

  it('keeps an empty side empty inside the block', () => {
    expect(wholeFileConflict('', 'x')).toBe(
      '<<<<<<< this branch\n=======\nx\n>>>>>>> incoming branch\n',
    );
  });
});
