import { describe, expect, it } from 'vitest';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import {
  TARGET_IDS,
  getBuiltinTargetDefinition,
  getEffectiveTargetSupportLevel,
  rewriteGeneratedOutputPath,
  resolveTargetFeatureGenerator,
} from '../../../src/targets/catalog/builtin-targets.js';

function baseConfig(): ValidatedConfig {
  return {
    version: 1,
    targets: [...TARGET_IDS],
    features: ['rules', 'commands', 'agents', 'skills', 'mcp', 'hooks', 'ignore', 'permissions'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
  };
}

describe('builtin targets', () => {
  it('returns built-in target metadata for registered targets', () => {
    const cursor = getBuiltinTargetDefinition('cursor');
    const kiro = getBuiltinTargetDefinition('kiro');

    expect(cursor).toBeDefined();
    expect(cursor?.generators.primaryRootInstructionPath).toBe('.cursor/rules/general.mdc');
    expect(cursor?.capabilities.permissions).toBe('native');
    expect(kiro?.generators.primaryRootInstructionPath).toBe('AGENTS.md');
    expect(kiro?.capabilities.rules).toBe('native');
    expect(kiro?.capabilities.commands).toBe('embedded');
    expect(kiro?.capabilities.hooks).toBe('native');
  });

  it('resolves codex-cli command generation through conversion-aware helpers', () => {
    const enabled = baseConfig();
    const disabled: ValidatedConfig = {
      ...baseConfig(),
      conversions: { commands_to_skills: { 'codex-cli': false } },
    };

    expect(resolveTargetFeatureGenerator('codex-cli', 'commands', enabled)).toBeTypeOf('function');
    expect(resolveTargetFeatureGenerator('codex-cli', 'commands', disabled)).toBeUndefined();
  });

  it('resolves windsurf agent generation through conversion-aware helpers', () => {
    const enabled = baseConfig();
    const disabled: ValidatedConfig = {
      ...baseConfig(),
      conversions: { agents_to_skills: { windsurf: false } },
    };

    expect(resolveTargetFeatureGenerator('windsurf', 'agents', enabled)).toBeTypeOf('function');
    expect(resolveTargetFeatureGenerator('windsurf', 'agents', disabled)).toBeUndefined();
  });

  it('reports effective support levels for projected features', () => {
    const enabled = baseConfig();
    const disabled: ValidatedConfig = {
      ...baseConfig(),
      conversions: {
        commands_to_skills: { 'codex-cli': false },
        agents_to_skills: { windsurf: false },
      },
    };

    expect(getEffectiveTargetSupportLevel('codex-cli', 'commands', enabled)).toBe('embedded');
    expect(getEffectiveTargetSupportLevel('codex-cli', 'commands', disabled)).toBe('none');
    expect(getEffectiveTargetSupportLevel('windsurf', 'agents', enabled)).toBe('embedded');
    expect(getEffectiveTargetSupportLevel('windsurf', 'agents', disabled)).toBe('none');
  });

  it('reports scope-specific support levels for global mode', () => {
    const config = baseConfig();

    expect(getEffectiveTargetSupportLevel('claude-code', 'ignore', config, 'global')).toBe(
      'embedded',
    );
    expect(getEffectiveTargetSupportLevel('antigravity', 'mcp', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('antigravity', 'commands', config, 'global')).toBe(
      'native',
    );
    expect(getEffectiveTargetSupportLevel('cursor', 'rules', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('cursor', 'hooks', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('cursor', 'ignore', config, 'global')).toBe('partial');
    expect(getEffectiveTargetSupportLevel('cursor', 'skills', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('cursor', 'commands', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('codex-cli', 'rules', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('copilot', 'mcp', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('copilot', 'hooks', config, 'global')).toBe('native');
    expect(getEffectiveTargetSupportLevel('copilot', 'permissions', config, 'global')).toBe(
      'partial',
    );
    expect(getEffectiveTargetSupportLevel('copilot', 'commands', config, 'global')).toBe('none');
  });

  it('rewrites generated output paths through scope-specific target layouts', () => {
    expect(
      rewriteGeneratedOutputPath('claude-code', '.claude/rules/typescript.md', 'project'),
    ).toBe('.claude/rules/typescript.md');
    expect(rewriteGeneratedOutputPath('claude-code', '.claude/rules/typescript.md', 'global')).toBe(
      '.claude/rules/typescript.md',
    );
    expect(rewriteGeneratedOutputPath('claude-code', '.mcp.json', 'global')).toBe('.claude.json');

    // Copilot CLI has no prompt-file/slash-command mechanism — no global commands surface.
    expect(
      rewriteGeneratedOutputPath('copilot', '.github/prompts/review.prompt.md', 'global'),
    ).toBeNull();
    expect(
      rewriteGeneratedOutputPath(
        'copilot',
        '.github/instructions/typescript.instructions.md',
        'global',
      ),
    ).toBe('.copilot/copilot-instructions.md');

    expect(rewriteGeneratedOutputPath('gemini-cli', '.geminiignore', 'global')).toBeNull();
    expect(
      rewriteGeneratedOutputPath('antigravity', '.agents/rules/typescript.md', 'global'),
    ).toBeNull();
  });
});
