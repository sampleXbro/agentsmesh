import { describe, expect, it } from 'vitest';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import {
  shouldConvertAgentsToSkills,
  shouldConvertCommandsToSkills,
} from '../../../src/config/core/conversions.js';

function makeConfig(overrides: Partial<ValidatedConfig> = {}): ValidatedConfig {
  return {
    version: 1,
    targets: ['claude-code'],
    features: ['rules'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    ...overrides,
  };
}

describe('conversion helpers', () => {
  it('uses default conversion settings when no overrides are configured', () => {
    const config = makeConfig();

    expect(shouldConvertCommandsToSkills(config, 'codex-cli')).toBe(true);
    expect(shouldConvertAgentsToSkills(config, 'gemini-cli')).toBe(false);
    expect(shouldConvertAgentsToSkills(config, 'claude-code')).toBe(false);
  });

  it('respects explicit conversion overrides', () => {
    const config = makeConfig({
      conversions: {
        commands_to_skills: { 'codex-cli': false },
        agents_to_skills: { 'gemini-cli': false, cline: false },
      },
    });

    expect(shouldConvertCommandsToSkills(config, 'codex-cli')).toBe(false);
    expect(shouldConvertAgentsToSkills(config, 'gemini-cli')).toBe(false);
    expect(shouldConvertAgentsToSkills(config, 'cline')).toBe(false);
  });

  it('returns false for unsupported targets', () => {
    const config = makeConfig();

    expect(shouldConvertCommandsToSkills(config, 'claude-code')).toBe(false);
    expect(shouldConvertAgentsToSkills(config, 'claude-code')).toBe(false);
  });

  it('resolves per-scope conversion values (project only)', () => {
    const config = makeConfig({
      conversions: {
        commands_to_skills: {
          'codex-cli': { project: true, global: false },
        },
        agents_to_skills: {
          cline: { project: true, global: false },
        },
      },
    });

    expect(shouldConvertCommandsToSkills(config, 'codex-cli', undefined, 'project')).toBe(true);
    expect(shouldConvertCommandsToSkills(config, 'codex-cli', undefined, 'global')).toBe(false);
    expect(shouldConvertAgentsToSkills(config, 'cline', undefined, 'project')).toBe(true);
    expect(shouldConvertAgentsToSkills(config, 'cline', undefined, 'global')).toBe(false);
  });

  it('resolves per-scope conversion values (global only)', () => {
    const config = makeConfig({
      conversions: {
        commands_to_skills: {
          'codex-cli': { project: false, global: true },
        },
      },
    });

    expect(shouldConvertCommandsToSkills(config, 'codex-cli', undefined, 'project')).toBe(false);
    expect(shouldConvertCommandsToSkills(config, 'codex-cli', undefined, 'global')).toBe(true);
  });

  it('falls back to builtin default when per-scope value is missing', () => {
    const config = makeConfig({
      conversions: {
        commands_to_skills: {
          'codex-cli': { project: false },
        },
      },
    });

    expect(shouldConvertCommandsToSkills(config, 'codex-cli', undefined, 'project')).toBe(false);
    // global not set in the object → falls back to builtin default (true)
    expect(shouldConvertCommandsToSkills(config, 'codex-cli', undefined, 'global')).toBe(true);
  });

  it('boolean value applies to both scopes', () => {
    const config = makeConfig({
      conversions: {
        agents_to_skills: { cline: false },
      },
    });

    expect(shouldConvertAgentsToSkills(config, 'cline', undefined, 'project')).toBe(false);
    expect(shouldConvertAgentsToSkills(config, 'cline', undefined, 'global')).toBe(false);
  });

  it('uses defaultEnabled for plugin targets not in builtin map', () => {
    const config = makeConfig();

    expect(shouldConvertCommandsToSkills(config, 'foo-ide', true, 'project')).toBe(true);
    expect(shouldConvertCommandsToSkills(config, 'foo-ide', false, 'project')).toBe(false);
  });

  it('per-scope override works for plugin targets', () => {
    const config = makeConfig({
      conversions: {
        commands_to_skills: {
          'foo-ide': { project: true, global: false },
        },
      },
    });

    expect(shouldConvertCommandsToSkills(config, 'foo-ide', true, 'project')).toBe(true);
    expect(shouldConvertCommandsToSkills(config, 'foo-ide', true, 'global')).toBe(false);
  });
});
