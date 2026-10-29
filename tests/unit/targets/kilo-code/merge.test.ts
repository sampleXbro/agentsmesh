import { describe, it, expect } from 'vitest';
import { mergeKiloConfig } from '../../../../src/targets/kilo-code/merge.js';
import {
  KILO_CONFIG_FILE,
  KILO_GLOBAL_CONFIG_FILE,
} from '../../../../src/targets/kilo-code/constants.js';

const PERMISSION_CONTENT = JSON.stringify({
  permission: { allow: ['Read'], deny: ['Bash'] },
});

describe('mergeKiloConfig (kilo-code)', () => {
  it('returns null when resolvedPath is not a kilo config file', () => {
    expect(mergeKiloConfig(null, null, PERMISSION_CONTENT, 'other.json')).toBeNull();
  });

  it('merges for the project-level config file path', () => {
    const existing = JSON.stringify({ custom: 'keep', permission: { allow: [] } });
    const result = mergeKiloConfig(existing, null, PERMISSION_CONTENT, KILO_CONFIG_FILE);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.custom).toBe('keep');
    expect(parsed.permission).toEqual({ allow: ['Read'], deny: ['Bash'] });
  });

  it('merges for the global-level config file path', () => {
    const existing = JSON.stringify({ custom: 'keep' });
    const result = mergeKiloConfig(existing, null, PERMISSION_CONTENT, KILO_GLOBAL_CONFIG_FILE);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.custom).toBe('keep');
    expect(parsed.permission).toEqual({ allow: ['Read'], deny: ['Bash'] });
  });

  it('prefers pending.content over existing as the merge base', () => {
    const existing = JSON.stringify({ from: 'existing' });
    const pending = {
      path: KILO_CONFIG_FILE,
      content: JSON.stringify({ from: 'pending', keepMe: true }),
    };
    const result = mergeKiloConfig(existing, pending, PERMISSION_CONTENT, KILO_CONFIG_FILE);
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.from).toBe('pending');
    expect(parsed.keepMe).toBe(true);
  });

  it('uses existing as base when pending is null', () => {
    const existing = JSON.stringify({ from: 'existing', keepMe: 1 });
    const result = mergeKiloConfig(existing, null, PERMISSION_CONTENT, KILO_CONFIG_FILE);
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.from).toBe('existing');
    expect(parsed.keepMe).toBe(1);
  });

  it('returns newContent when both existing and pending are null', () => {
    expect(mergeKiloConfig(null, null, PERMISSION_CONTENT, KILO_CONFIG_FILE)).toBe(
      PERMISSION_CONTENT,
    );
  });

  it('returns newContent when pending content is null and existing is null', () => {
    const pending = { path: KILO_CONFIG_FILE, content: null as unknown as string };
    expect(mergeKiloConfig(null, pending, PERMISSION_CONTENT, KILO_CONFIG_FILE)).toBe(
      PERMISSION_CONTENT,
    );
  });

  // A base kilo.jsonc we cannot parse as an object is preserved verbatim.
  // Coercing it to {} and serialising over the top cost the user every key —
  // and "jsonc" is the file's own format, so comments are expected.
  it.each([
    ['an array', JSON.stringify(['a', 'b'])],
    ['null', 'null'],
    ['a non-object scalar (number)', '42'],
    ['a non-object scalar (string)', '"hello"'],
    ['invalid JSON', '{not valid json'],
    ['JSONC with comments', '{\n  // keep me\n  "theme": "dark"\n}'],
  ])('preserves the base verbatim when it is %s', (_label, base) => {
    expect(mergeKiloConfig(base, null, PERMISSION_CONTENT, KILO_CONFIG_FILE)).toBe(base);
  });

  it('returns base unchanged when incoming is null', () => {
    const base = JSON.stringify({ custom: 'keep' });
    expect(mergeKiloConfig(base, null, 'null', KILO_CONFIG_FILE)).toBe(base);
  });

  it('returns base unchanged when incoming is a non-object scalar', () => {
    const base = JSON.stringify({ custom: 'keep' });
    expect(mergeKiloConfig(base, null, '7', KILO_CONFIG_FILE)).toBe(base);
  });

  it('returns base unchanged when incoming is an array', () => {
    const base = JSON.stringify({ custom: 'keep' });
    expect(mergeKiloConfig(base, null, '["x"]', KILO_CONFIG_FILE)).toBe(base);
  });

  it('does not touch permission when overlay has no permission key', () => {
    const base = JSON.stringify({ permission: { allow: ['keep'] }, custom: 'keep' });
    const incoming = JSON.stringify({ unrelated: true });
    const result = mergeKiloConfig(base, null, incoming, KILO_CONFIG_FILE);
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.permission).toEqual({ allow: ['keep'] });
    expect(parsed.custom).toBe('keep');
    expect(parsed.unrelated).toBeUndefined();
  });

  it('overlays the instructions key (global additionalRules)', () => {
    const existing = JSON.stringify({ custom: 'keep' });
    const incoming = JSON.stringify({ instructions: ['rules/*.md'] });
    const result = mergeKiloConfig(existing, null, incoming, KILO_GLOBAL_CONFIG_FILE);
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.custom).toBe('keep');
    expect(parsed.instructions).toEqual(['rules/*.md']);
  });

  it('preserves user-authored instruction globs when adding generated rules', () => {
    const existing = JSON.stringify({ instructions: ['docs/standards.md'] });
    const next = JSON.stringify({ instructions: ['.kilo/rules/*.md'] });
    const result = mergeKiloConfig(existing, undefined, next, KILO_CONFIG_FILE);
    expect(JSON.parse(result as string).instructions)
      .toEqual(['docs/standards.md', '.kilo/rules/*.md']);
    const again = mergeKiloConfig(result, undefined, next, KILO_CONFIG_FILE);
    expect(JSON.parse(again as string).instructions)
      .toEqual(['docs/standards.md', '.kilo/rules/*.md']);
  });

  it('overlays the mcp key (global MCP servers)', () => {
    const existing = JSON.stringify({ custom: 'keep' });
    const incoming = JSON.stringify({ mcp: { test: { type: 'local', command: ['node'] } } });
    const result = mergeKiloConfig(existing, null, incoming, KILO_GLOBAL_CONFIG_FILE);
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.custom).toBe('keep');
    expect(parsed.mcp).toEqual({ test: { type: 'local', command: ['node'] } });
  });

  it('chains permission, instructions, and mcp writes to the same file (pending base)', () => {
    // Simulates three sequential emitGeneratedOutput calls to the same path in
    // one generate run: permissions writes first, then instructions, then mcp
    // — each using the previous pending result as its base.
    const afterPermissions = mergeKiloConfig(
      null,
      undefined,
      JSON.stringify({ permission: { allow: ['Read'] } }),
      KILO_GLOBAL_CONFIG_FILE,
    ) as string;
    const afterInstructions = mergeKiloConfig(
      null,
      {
        target: 'kilo-code',
        path: KILO_GLOBAL_CONFIG_FILE,
        content: afterPermissions,
        status: 'created',
      },
      JSON.stringify({ instructions: ['rules/*.md'] }),
      KILO_GLOBAL_CONFIG_FILE,
    ) as string;
    const afterMcp = mergeKiloConfig(
      null,
      {
        target: 'kilo-code',
        path: KILO_GLOBAL_CONFIG_FILE,
        content: afterInstructions,
        status: 'created',
      },
      JSON.stringify({ mcp: { test: { type: 'local', command: ['node'] } } }),
      KILO_GLOBAL_CONFIG_FILE,
    ) as string;
    const parsed = JSON.parse(afterMcp) as Record<string, unknown>;
    expect(parsed.permission).toEqual({ allow: ['Read'] });
    expect(parsed.instructions).toEqual(['rules/*.md']);
    expect(parsed.mcp).toEqual({ test: { type: 'local', command: ['node'] } });
  });

  it('does not touch instructions or mcp when overlay has neither key', () => {
    const base = JSON.stringify({ instructions: ['keep/*.md'], mcp: { keep: {} }, custom: 'keep' });
    const incoming = JSON.stringify({ permission: { allow: ['Read'] } });
    const result = mergeKiloConfig(base, null, incoming, KILO_GLOBAL_CONFIG_FILE);
    const parsed = JSON.parse(result as string) as Record<string, unknown>;
    expect(parsed.instructions).toEqual(['keep/*.md']);
    expect(parsed.mcp).toEqual({ keep: {} });
    expect(parsed.permission).toEqual({ allow: ['Read'] });
  });
});
