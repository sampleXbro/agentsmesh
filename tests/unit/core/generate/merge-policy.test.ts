import { describe, expect, it } from 'vitest';
import {
  mergeOutputContent,
  outputMergeOptions,
} from '../../../../src/core/generate/merge-policy.js';
import type { GenerateResult } from '../../../../src/core/types.js';

describe('mergeOutputContent', () => {
  it('returns the generated content for an unknown target', () => {
    expect(mergeOutputContent('no-such-target', 'OLD', undefined, 'NEW', 'anything.md')).toBe(
      'NEW',
    );
  });

  it('returns the generated content when the descriptor declines the path', () => {
    expect(mergeOutputContent('crush', 'OLD', undefined, 'NEW', 'CRUSH.md')).toBe('NEW');
  });

  it('uses the descriptor merge hook when it claims the path', () => {
    const merged = mergeOutputContent(
      'crush',
      '{"models":{"large":{}}}',
      undefined,
      '{"mcp":{"fetch":{}}}',
      'crush.json',
    );
    expect(JSON.parse(merged)).toEqual({ models: { large: {} }, mcp: { fetch: {} } });
  });

  it('falls back to the shared settings.json merge when no hook claims the path', () => {
    const merged = mergeOutputContent(
      'claude-code',
      '{"theme":"dark"}',
      undefined,
      '{"permissions":{"allow":["Read"]}}',
      '.claude/settings.json',
    );
    expect(JSON.parse(merged)).toEqual({
      theme: 'dark',
      permissions: { allow: ['Read'] },
    });
  });

  it('returns the generated content for a settings.json path with no base', () => {
    expect(mergeOutputContent('claude-code', null, undefined, 'NEW', '.claude/settings.json')).toBe(
      'NEW',
    );
  });

  it('prefers a pending result over the on-disk file as merge base', () => {
    const pending: GenerateResult = {
      target: 'claude-code',
      path: '.claude/settings.json',
      content: '{"theme":"from-pending"}',
      status: 'updated',
    };
    const merged = mergeOutputContent(
      'claude-code',
      '{"theme":"from-disk"}',
      pending,
      '{"hooks":{}}',
      '.claude/settings.json',
    );
    expect(JSON.parse(merged)).toEqual({ theme: 'from-pending', hooks: {} });
  });
});

describe('outputMergeOptions', () => {
  it('binds the shared policy to one target', () => {
    const options = outputMergeOptions('crush');
    const merged = options.mergeContent!('{"models":{}}', undefined, '{"mcp":{}}', 'crush.json');
    expect(JSON.parse(merged)).toEqual({ models: {}, mcp: {} });
  });
});
