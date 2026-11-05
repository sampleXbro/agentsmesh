import { describe, expect, it } from 'vitest';
import { mergeGeminiSettingsJson, mergeSettingsJson } from '../../../src/core/generate/settings.js';

describe('mergeSettingsJson', () => {
  // A base that is not a JSON object is preserved, not replaced: these paths are
  // comment-legal and rewriting them drops the user's comments and every key.
  it('preserves a non-object existing base rather than merging over it', () => {
    expect(mergeSettingsJson('null', '{"permissions":{"allow":["Read"]}}')).toBe('null');
  });

  it('merges into a well-formed base', () => {
    expect(mergeSettingsJson('{"model":"opus"}', '{"permissions":{"allow":["Read"]}}')).toBe(
      JSON.stringify(
        {
          model: 'opus',
          permissions: {
            allow: ['Read'],
          },
        },
        null,
        2,
      ),
    );
  });

  it('keeps the user lists that the generated permissions leave out', () => {
    const base = JSON.stringify({
      permissions: { allow: ['Old'], deny: ['Bash(rm:*)'], ask: ['Write'], defaultMode: 'plan' },
    });
    expect(JSON.parse(mergeSettingsJson(base, '{"permissions":{"allow":["Read"]}}'))).toEqual({
      permissions: { allow: ['Read'], deny: ['Bash(rm:*)'], ask: ['Write'], defaultMode: 'plan' },
    });
  });
});

describe('mergeGeminiSettingsJson', () => {
  it('preserves a non-object existing base rather than merging hooks over it', () => {
    expect(mergeGeminiSettingsJson('null', '{"hooks":{"PostToolUse":[]}}')).toBe('null');
  });

  it('merges hook-only updates into a well-formed base', () => {
    expect(mergeGeminiSettingsJson('{"theme":"dark"}', '{"hooks":{"PostToolUse":[]}}')).toBe(
      JSON.stringify(
        {
          theme: 'dark',
          hooks: {
            PostToolUse: [],
          },
        },
        null,
        2,
      ),
    );
  });
});
