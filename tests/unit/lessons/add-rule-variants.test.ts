/**
 * Re-capturing a rule that differs only by case, trailing sentence punctuation
 * or wrapping quotes UPSERTS the existing lesson instead of minting a `-2`
 * near-duplicate. The wider key is for matching an incoming capture only:
 * `normalizeRule` (DUPLICATE_RULE, 3-way merge) is unchanged.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLesson } from '../../../src/lessons/add.js';
import { normalizeRule } from '../../../src/lessons/add-helpers.js';
import { looseRuleKey } from '../../../src/lessons/rule-key.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';

let root: string;
const RULE = 'Prefer small focused functions over long ones';
const TRIGGERS = { files: ['src/lib/use*Form*.ts'] };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-add-rule-variants-'));
  saveLessonsGraph(root, {
    version: 2,
    lessons: {},
    topics: { build: { summary: 'Build.' }, tests: { summary: 'Tests.' } },
    triggers: {},
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('looseRuleKey — the key an incoming capture is matched on', () => {
  it.each([
    ['Prefer small functions', 'prefer small functions'],
    ['prefer small functions.', 'prefer small functions'],
    ['Prefer small functions!', 'prefer small functions'],
    ['Prefer small functions;', 'prefer small functions'],
    ['Prefer small functions:', 'prefer small functions'],
    ['Prefer small functions...', 'prefer small functions'],
    ['  Prefer   small\tfunctions . ', 'prefer small functions'],
    ['"Prefer small functions."', 'prefer small functions'],
    ['"Prefer small functions".', 'prefer small functions'],
    ["'Prefer small functions'", 'prefer small functions'],
    ['`Prefer small functions`', 'prefer small functions'],
    ['“Prefer small functions.”', 'prefer small functions'],
  ])('%j → %j', (rule, key) => {
    expect(looseRuleKey(normalizeRule(rule))).toBe(key);
  });

  it('keeps text that only looks like punctuation or quotes', () => {
    expect(looseRuleKey(normalizeRule("Use 'a' and 'b'"))).toBe("use 'a' and 'b'");
    expect(looseRuleKey(normalizeRule("Keep the users' data"))).toBe("keep the users' data");
    expect(looseRuleKey(normalizeRule('Run `a` then `b`'))).toBe('run `a` then `b`');
    expect(looseRuleKey(normalizeRule('Use x? then y'))).toBe('use x? then y');
  });

  it('keeps a rule made only of punctuation distinct from the empty key', () => {
    expect(looseRuleKey(normalizeRule('...'))).toBe('...');
    expect(looseRuleKey(normalizeRule('"."'))).toBe('"."');
  });

  it('does not merge different rules', () => {
    expect(looseRuleKey('use pnpm.')).not.toBe(looseRuleKey('use npm.'));
  });
});

describe('addLesson — case and punctuation variants update the existing lesson', () => {
  it.each([
    'prefer small focused functions over long ones.',
    'Prefer small focused functions over long ones.',
    'PREFER SMALL FOCUSED FUNCTIONS OVER LONG ONES!',
    '"Prefer small focused functions over long ones."',
    'Prefer small focused functions over long ones;',
    '  Prefer   small focused\tfunctions over long ones: ',
  ])('%j is an upsert', async (variant) => {
    const first = await addLesson(root, { rule: RULE, topic: 'build', triggers: TRIGGERS });
    const second = await addLesson(root, {
      rule: variant,
      topic: 'tests',
      triggers: { keywords: ['small functions'] },
    });
    expect(second.isNewLesson).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.warnings.map((w) => w.code)).not.toContain('NEAR_DUPLICATE_LESSON');
    expect(Object.keys(loadLessonsGraph(root).lessons)).toEqual([first.id]);
    const lesson = loadLessonsGraph(root).lessons[first.id]!;
    expect(lesson.rule).toBe(RULE);
    expect(lesson.topics).toEqual(['build', 'tests']);
    expect(lesson.triggers).toHaveLength(2);
  });

  it('matches the stored rule even when the STORED text has the punctuation', async () => {
    const first = await addLesson(root, {
      rule: `${RULE}.`,
      topic: 'build',
      triggers: TRIGGERS,
    });
    const second = await addLesson(root, { rule: RULE, topic: 'build', triggers: {} });
    expect(second.isNewLesson).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it('still creates a new lesson for a different rule', async () => {
    await addLesson(root, { rule: RULE, topic: 'build', triggers: TRIGGERS });
    const other = await addLesson(root, {
      rule: 'Prefer small focused modules over long ones.',
      topic: 'build',
      triggers: TRIGGERS,
    });
    expect(other.isNewLesson).toBe(true);
    expect(Object.keys(loadLessonsGraph(root).lessons)).toHaveLength(2);
  });

  it('still ignores a deprecated lesson and creates a fresh active one', async () => {
    saveLessonsGraph(root, {
      version: 2,
      lessons: {
        'build-old': {
          rule: `${RULE}.`,
          topics: ['build'],
          triggers: [],
          evidence: [],
          status: 'deprecated',
          createdAt: '2026-01-01',
        },
      },
      topics: { build: { summary: 'Build.' } },
      triggers: {},
    });
    const result = await addLesson(root, { rule: RULE, topic: 'build', triggers: TRIGGERS });
    expect(result.isNewLesson).toBe(true);
  });
});

describe('DUPLICATE_RULE keeps its narrow key', () => {
  it('does not flag two active lessons that differ only by punctuation', () => {
    const graph = {
      version: 2 as const,
      lessons: {
        a: lesson(RULE),
        b: lesson(`${RULE}.`),
      },
      topics: { build: { summary: 'Build.' } },
      triggers: {},
    };
    const codes = validateLessonsGraph(graph).findings.map((f) => f.code);
    expect(codes).not.toContain('DUPLICATE_RULE');
  });

  it('still flags two active lessons with the same normalized rule', () => {
    const graph = {
      version: 2 as const,
      lessons: { a: lesson(RULE), b: lesson(RULE.toUpperCase()) },
      topics: { build: { summary: 'Build.' } },
      triggers: {},
    };
    const dup = validateLessonsGraph(graph).findings.filter((f) => f.code === 'DUPLICATE_RULE');
    expect(dup.map((f) => f.lessonId)).toEqual(['a', 'b']);
  });
});

function lesson(rule: string): {
  rule: string;
  topics: string[];
  triggers: string[];
  evidence: string[];
  status: 'active';
  createdAt: string;
} {
  return {
    rule,
    topics: ['build'],
    triggers: [],
    evidence: [],
    status: 'active',
    createdAt: '2026-01-01',
  };
}
