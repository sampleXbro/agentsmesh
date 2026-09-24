import { describe, expect, it } from 'vitest';
import { parseFlexibleFrontmatter } from '../../../../src/targets/gemini-cli/format-helpers-shared.js';
import { mapGeminiHookEvent } from '../../../../src/targets/gemini-cli/hook-map.js';

describe('mapGeminiHookEvent', () => {
  it('maps BeforeTool and preToolUse to PreToolUse', () => {
    expect(mapGeminiHookEvent('BeforeTool')).toBe('PreToolUse');
    expect(mapGeminiHookEvent('preToolUse')).toBe('PreToolUse');
  });

  it('maps AfterTool and postToolUse to PostToolUse', () => {
    expect(mapGeminiHookEvent('AfterTool')).toBe('PostToolUse');
    expect(mapGeminiHookEvent('postToolUse')).toBe('PostToolUse');
  });

  it('maps Notification and notification to Notification', () => {
    expect(mapGeminiHookEvent('Notification')).toBe('Notification');
    expect(mapGeminiHookEvent('notification')).toBe('Notification');
  });

  it('returns null for unknown events', () => {
    expect(mapGeminiHookEvent('Unknown')).toBeNull();
    expect(mapGeminiHookEvent('')).toBeNull();
  });
});

describe('parseFlexibleFrontmatter', () => {
  it('parses YAML frontmatter when content starts with ---', () => {
    const { frontmatter, body } = parseFlexibleFrontmatter('---\nname: foo\n---\nbody text');
    expect(frontmatter.name).toBe('foo');
    expect(body.trim()).toBe('body text');
  });

  it('parses TOML frontmatter when content starts with +++', () => {
    const { frontmatter, body } = parseFlexibleFrontmatter('+++\nname = "foo"\n+++\nbody text');
    expect(frontmatter.name).toBe('foo');
    expect(body).toBe('body text');
  });

  it('treats empty TOML body as empty frontmatter', () => {
    const { frontmatter, body } = parseFlexibleFrontmatter('+++\n+++\nbody');
    expect(frontmatter).toEqual({});
    expect(body).toBe('body');
  });

  it('returns empty frontmatter when TOML close is missing', () => {
    const { frontmatter, body } = parseFlexibleFrontmatter('+++\nname = "foo"\nno close');
    expect(frontmatter).toEqual({});
    expect(body).toContain('+++');
  });

  it('catches TOML parse errors and returns empty frontmatter', () => {
    const { frontmatter, body } = parseFlexibleFrontmatter('+++\nbad = = = toml\n+++\nbody');
    expect(frontmatter).toEqual({});
    expect(body).toContain('+++');
  });

  it('returns empty frontmatter when content has no markers', () => {
    const { frontmatter, body } = parseFlexibleFrontmatter('plain text\nno frontmatter');
    expect(frontmatter).toEqual({});
    expect(body).toBe('plain text\nno frontmatter');
  });

  it('prefers YAML when content starts with --- before +++', () => {
    const { frontmatter } = parseFlexibleFrontmatter('---\nname: yaml\n---\nbody +++ inline');
    expect(frontmatter.name).toBe('yaml');
  });

  it('does not parse YAML when --- not at offset 0', () => {
    const { frontmatter, body } = parseFlexibleFrontmatter('text\n---\nname: foo\n---\n');
    expect(frontmatter).toEqual({});
    expect(body.trim()).toContain('---');
  });
});
