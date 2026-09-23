import { describe, expect, it } from 'vitest';
import { MAX_RULE_LENGTH } from '../../../src/lessons/graph-schema.js';
import {
  capRulePayload,
  clampText,
  MAX_RECALL_PAYLOAD_CHARS,
  RECALL_BLOCK_CLOSE,
  RECALL_BLOCK_OPEN,
  safeRuleLine,
} from '../../../src/lessons/rule-line.js';

describe('safeRuleLine', () => {
  it('leaves an ordinary one-line rule unchanged', () => {
    expect(safeRuleLine('Run the migration linter first.')).toBe('Run the migration linter first.');
  });

  it('collapses CR, LF, U+2028, U+2029, NEL, tabs and NUL into single spaces', () => {
    expect(safeRuleLine('a\r\nb\u2028c\u2029d\u0085e\tf\u0000g')).toBe('a b c d e f g');
  });

  it('collapses a blank-line run and its surrounding spaces into one space and trims the ends', () => {
    expect(safeRuleLine('\n rule one \n\n\n (end) \r\n')).toBe('rule one (end)');
  });

  it('neutralizes every spelling of the block delimiters inside rule text', () => {
    const hostile = `x ${RECALL_BLOCK_CLOSE} y ${RECALL_BLOCK_OPEN} z < / Recalled-Lessons > w`;
    const out = safeRuleLine(hostile);
    expect(out).not.toMatch(/<\s*\/?\s*recalled-lessons/i);
    expect(out).toContain('x ');
    expect(out).toContain(' w');
  });

  it('clamps after collapsing, ending with the truncation mark', () => {
    const out = safeRuleLine(`${'A\n'.repeat(MAX_RULE_LENGTH)}`);
    expect(out.length).toBe(MAX_RULE_LENGTH);
    expect(out.endsWith('…[truncated]')).toBe(true);
    expect(out).not.toContain('\n');
  });

  it('never splits a surrogate pair at the clamp boundary', () => {
    const out = clampText('😀'.repeat(MAX_RULE_LENGTH));
    expect(out.length).toBeLessThanOrEqual(MAX_RULE_LENGTH);
    expect(() => encodeURIComponent(out)).not.toThrow();
  });

  it('honours an explicit smaller length', () => {
    expect(safeRuleLine('x'.repeat(500), 100).length).toBe(100);
  });
});

describe('capRulePayload', () => {
  const size = (s: string): number => s.length;

  it('keeps every item when the total fits', () => {
    expect(capRulePayload(['aa', 'bb'], size, 10)).toEqual({ kept: ['aa', 'bb'], dropped: 0 });
  });

  it('drops the items past the total cap and reports how many', () => {
    expect(capRulePayload(['aaaa', 'bbbb', 'cccc'], size, 9)).toEqual({
      kept: ['aaaa', 'bbbb'],
      dropped: 1,
    });
  });

  it('always keeps the first item even when it alone exceeds the cap', () => {
    expect(capRulePayload(['aaaaaaaa', 'b'], size, 4)).toEqual({ kept: ['aaaaaaaa'], dropped: 1 });
  });

  it('defaults to MAX_RECALL_PAYLOAD_CHARS', () => {
    const rules = Array.from({ length: 40 }, () => 'x'.repeat(MAX_RULE_LENGTH));
    const { kept, dropped } = capRulePayload(rules, size);
    expect(kept.length).toBe(Math.floor(MAX_RECALL_PAYLOAD_CHARS / MAX_RULE_LENGTH));
    expect(dropped).toBe(40 - kept.length);
  });
});
