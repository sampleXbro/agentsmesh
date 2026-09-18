import { describe, it, expect } from 'vitest';
import { configSchema } from '../../../src/config/core/schema.js';
import { TARGET_IDS } from '../../../src/targets/catalog/target-ids.js';

describe('configSchema', () => {
  it('validates minimal config', () => {
    const result = configSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      // Defaults should be filled
      expect(result.data.targets).toEqual([...TARGET_IDS]);
      expect(result.data.features).toContain('rules');
    }
  });

  it('validates full config', () => {
    const result = configSchema.safeParse({
      version: 1,
      targets: ['claude-code', 'cursor'],
      features: ['rules', 'mcp'],
      extends: [{ name: 'base', source: './shared/', target: 'codex-cli', features: ['rules'] }],
      overrides: { cursor: { extra_rules: ['rules/cursor/*.md'] } },
      collaboration: { strategy: 'merge', lock_features: ['mcp'] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extends[0]?.target).toBe('codex-cli');
    }
  });

  it('validates conversion settings for skill-based projections', () => {
    const result = configSchema.safeParse({
      version: 1,
      conversions: {
        commands_to_skills: { 'codex-cli': false },
        agents_to_skills: {
          'gemini-cli': false,
          cline: true,
          'codex-cli': true,
          windsurf: false,
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conversions?.commands_to_skills?.['codex-cli']).toBe(false);
      expect(result.data.conversions?.agents_to_skills?.['gemini-cli']).toBe(false);
      expect(result.data.conversions?.agents_to_skills?.cline).toBe(true);
    }
  });

  it('rejects unknown target', () => {
    const result = configSchema.safeParse({
      version: 1,
      targets: ['unknown-tool'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown feature', () => {
    const result = configSchema.safeParse({
      version: 1,
      features: ['teleport'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown extend target', () => {
    const result = configSchema.safeParse({
      version: 1,
      extends: [{ name: 'base', source: './shared/', target: 'not-a-target', features: ['rules'] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing version', () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects version other than 1', () => {
    const result = configSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });
});
