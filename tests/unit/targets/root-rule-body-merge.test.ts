/**
 * Root-rule body merge semantics.
 *
 * `.agentsmesh/rules/_root.md` is the single canonical slot that EVERY target's
 * root instruction collapses into. Unlike a command or a skill — where a name
 * collision means the two sources describe the same entity — two tools' root
 * rules are different content that merely share a slot, so the second one must
 * never silently replace the first.
 */

import { describe, it, expect } from 'vitest';
import {
  mergeRootRuleBody,
  rootRuleBodyGrew,
} from '../../../src/targets/import/root-rule-body-merge.js';
import { ROOT_RULE_PLACEHOLDER_BODY } from '../../../src/canonical/root-rule-placeholder.js';

describe('mergeRootRuleBody', () => {
  it('returns the incoming body when nothing exists yet', () => {
    expect(mergeRootRuleBody('', '# Claude\n- Prefer pnpm.')).toBe('# Claude\n- Prefer pnpm.');
  });

  it('keeps the existing body when the incoming body is empty', () => {
    expect(mergeRootRuleBody('# Claude\n- Prefer pnpm.', '')).toBe('# Claude\n- Prefer pnpm.');
  });

  it('keeps the existing body when the incoming body is only whitespace', () => {
    expect(mergeRootRuleBody('# Claude', '   \n\n  ')).toBe('# Claude');
  });

  it('appends a second tool’s body instead of replacing the first', () => {
    const merged = mergeRootRuleBody('# Claude rules\n- Prefer pnpm.', '# Cursor rules\n- Strict.');
    expect(merged).toBe('# Claude rules\n- Prefer pnpm.\n\n# Cursor rules\n- Strict.');
  });

  it('is idempotent: re-importing identical content does not duplicate it', () => {
    const body = '# Root\n- Rule A';
    expect(mergeRootRuleBody(body, body)).toBe(body);
  });

  it('does not duplicate when the incoming body is already contained in the existing body', () => {
    const existing = '# Claude rules\n- Prefer pnpm.\n\n# Cursor rules\n- Strict.';
    expect(mergeRootRuleBody(existing, '# Cursor rules\n- Strict.')).toBe(existing);
  });

  it('takes the incoming body when it is a superset (source edited upstream, then re-imported)', () => {
    const existing = '# Root\n- Rule A';
    const incoming = '# Root\n- Rule A\n- Rule B added later';
    expect(mergeRootRuleBody(existing, incoming)).toBe(incoming);
  });

  it('normalizes CRLF so a Windows-authored source does not defeat de-duplication', () => {
    expect(mergeRootRuleBody('# Root\r\n- Rule A', '# Root\n- Rule A')).toBe('# Root\n- Rule A');
  });

  it('trims surrounding blank lines rather than accumulating them across merges', () => {
    expect(mergeRootRuleBody('\n\n# Claude\n\n', '\n# Cursor\n\n')).toBe('# Claude\n\n# Cursor');
  });

  it('replaces the init placeholder instead of keeping it above imported rules', () => {
    const merged = mergeRootRuleBody(ROOT_RULE_PLACEHOLDER_BODY, '# Claude rules\n- Prefer pnpm.');
    expect(merged).toBe('# Claude rules\n- Prefer pnpm.');
    expect(merged).not.toContain('Add your project-wide instructions here.');
  });

  it('merges three distinct sources in import order', () => {
    const first = mergeRootRuleBody('', '# A');
    const second = mergeRootRuleBody(first, '# B');
    expect(mergeRootRuleBody(second, '# C')).toBe('# A\n\n# B\n\n# C');
  });
});

describe('rootRuleBodyGrew', () => {
  it('is false when the root was empty before the import', () => {
    expect(rootRuleBodyGrew('', '# Claude')).toBe(false);
  });

  it('is false when the root only held the init placeholder', () => {
    expect(rootRuleBodyGrew(ROOT_RULE_PLACEHOLDER_BODY, '# Claude')).toBe(false);
  });

  it('is false when the import changed nothing', () => {
    expect(rootRuleBodyGrew('# Claude', '# Claude')).toBe(false);
  });

  it('is false when the import replaced the body rather than adding to it', () => {
    expect(rootRuleBodyGrew('# Claude', '# Cursor')).toBe(false);
  });

  it('is true when a second tool accumulated onto the first', () => {
    expect(rootRuleBodyGrew('# Claude', '# Claude\n\n# Cursor')).toBe(true);
  });
});
