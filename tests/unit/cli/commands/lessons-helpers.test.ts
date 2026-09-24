import { describe, expect, it } from 'vitest';
import {
  numberFlag,
  renderLessonMarkdown,
  repeatedFlag,
} from '../../../../src/cli/commands/lessons-helpers.js';

describe('numberFlag', () => {
  it('parses a valid numeric string', () => {
    expect(numberFlag({ n: '5' }, 'n')).toBe(5);
  });
  it('returns null for a non-numeric string', () => {
    expect(numberFlag({ n: 'wat' }, 'n')).toBeNull();
  });
  it('returns null when absent', () => {
    expect(numberFlag({}, 'n')).toBeNull();
  });
  it('returns null for boolean or array values', () => {
    expect(numberFlag({ n: true }, 'n')).toBeNull();
    expect(numberFlag({ n: ['1'] }, 'n')).toBeNull();
  });
});

describe('repeatedFlag', () => {
  it('returns an array as-is, dropping empties', () => {
    expect(repeatedFlag({ f: ['a', 'b', ''] }, 'f')).toEqual(['a', 'b']);
  });
  it('wraps a single string in an array', () => {
    expect(repeatedFlag({ f: 'a' }, 'f')).toEqual(['a']);
  });
  it('returns [] for absent or boolean values', () => {
    expect(repeatedFlag({}, 'f')).toEqual([]);
    expect(repeatedFlag({ f: true }, 'f')).toEqual([]);
  });
  it('returns [] for an empty string', () => {
    expect(repeatedFlag({ f: '' }, 'f')).toEqual([]);
  });
});

describe('renderLessonMarkdown — branch coverage', () => {
  const base = {
    rule: 'A rule.',
    topics: ['t'],
    triggers: ['t-1'],
    evidence: ['commit:abc'],
    status: 'active' as const,
    createdAt: '2026-06-05',
  };
  const triggers = { 't-1': { kind: 'file_glob' as const, pattern: 'src/**' } };

  it('renders "(none)" for a lesson with no topics, triggers, or evidence', () => {
    const md = renderLessonMarkdown(
      'rule-a',
      { ...base, topics: [], triggers: [], evidence: [] },
      {},
    );
    expect(md).toContain('**topics:** (none)');
    expect(md).toContain('- (none)');
    expect(md).toContain('**evidence:** (none)');
  });

  it('flags a trigger id that resolves to no trigger node', () => {
    const md = renderLessonMarkdown('rule-a', { ...base, triggers: ['t-missing'] }, {});
    expect(md).toContain('[missing trigger node]');
  });

  it('renders resolved triggers, evidence, and a supersededBy line', () => {
    const md = renderLessonMarkdown('rule-a', { ...base, supersededBy: 'rule-b' }, triggers);
    expect(md).toContain('t-1 [file_glob] src/**');
    expect(md).toContain('commit:abc');
    expect(md).toContain('**superseded by:** rule-b');
  });

  it('shows the rationale right after the rule, and omits the line when there is none', () => {
    const md = renderLessonMarkdown(
      'rule-a',
      { ...base, rationale: 'It broke CI twice.' },
      triggers,
    );
    expect(md).toContain('A rule.\n\n**rationale:** It broke CI twice.\n\n**topics:** t');
    expect(renderLessonMarkdown('rule-a', base, triggers)).not.toContain('**rationale:**');
  });
});
