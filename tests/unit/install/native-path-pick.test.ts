/**
 * Native install path → target hint and scoping.
 */

import { describe, it, expect } from 'vitest';
import {
  targetHintFromNativePath,
  pathSupportsNativePick,
  validateTargetMatchesPath,
  extendPickHasArrays,
} from '../../../src/install/native/native-path-pick.js';
import type { ExtendPick } from '../../../src/config/core/schema.js';

describe('targetHintFromNativePath', () => {
  it('prefers longer prefixes', () => {
    expect(targetHintFromNativePath('.github/instructions/foo')).toBe('copilot');
    expect(targetHintFromNativePath('.github/prompts')).toBe('copilot');
    expect(targetHintFromNativePath('.gemini/commands')).toBe('gemini-cli');
    expect(targetHintFromNativePath('.kiro/steering/typescript.md')).toBe('kiro');
    expect(targetHintFromNativePath('.kilo/agents/reviewer.md')).toBe('kilo-code');
    expect(targetHintFromNativePath('.kilocode/workflows/review.md')).toBe('kilo-code');
    expect(targetHintFromNativePath('.claude/rules/ts')).toBe('claude-code');
  });

  it('returns undefined for unknown paths', () => {
    expect(targetHintFromNativePath('unknown/path')).toBeUndefined();
    expect(targetHintFromNativePath('')).toBeUndefined();
  });

  it('handles exact matches', () => {
    expect(targetHintFromNativePath('.github/copilot-instructions.md')).toBe('copilot');
    expect(targetHintFromNativePath('.codex/config.toml')).toBe('codex-cli');
    expect(targetHintFromNativePath('.kilocodeignore')).toBe('kilo-code');
  });

  it('resolves previously-unmapped targets via descriptor derivation', () => {
    // These were not in the old hardcoded PATH_PREFIX_TO_TARGET array;
    // descriptor-driven derivation picks them up automatically.
    expect(targetHintFromNativePath('.opencode/rules')).toBe('opencode');
    expect(targetHintFromNativePath('.augment/commands/build.md')).toBe('augment-code');
    expect(targetHintFromNativePath('.roo/skills/foo')).toBe('roo-code');
    expect(targetHintFromNativePath('.qwen/agents/x.md')).toBe('qwen-code');
    expect(targetHintFromNativePath('.trae/rules')).toBe('trae');
  });

  it('returns undefined for paths shared by multiple targets (ambiguous markers)', () => {
    // `AGENTS.md` and `.agents/skills/` are claimed by many descriptors —
    // hints must be undefined so the caller falls through to other resolution.
    expect(targetHintFromNativePath('AGENTS.md')).toBeUndefined();
    expect(targetHintFromNativePath('.agents/skills/some-skill')).toBeUndefined();
  });

  it('normalizes path separators', () => {
    expect(targetHintFromNativePath('.claude\\rules\\ts')).toBe('claude-code');
    expect(targetHintFromNativePath('/.cursor/rules/')).toBe('cursor');
  });
});

describe('pathSupportsNativePick', () => {
  it('matches hint to target', () => {
    expect(pathSupportsNativePick('.cursor/rules', 'cursor')).toBe(true);
    expect(pathSupportsNativePick('.kiro/skills', 'kiro')).toBe(true);
    expect(pathSupportsNativePick('.cursor/rules', 'gemini-cli')).toBe(false);
  });

  it('returns false for unknown paths', () => {
    expect(pathSupportsNativePick('unknown/path', 'cursor')).toBe(false);
  });
});

describe('validateTargetMatchesPath', () => {
  it('does nothing when no explicit target', () => {
    expect(() => validateTargetMatchesPath(undefined, '.cursor/rules')).not.toThrow();
  });

  it('does nothing when no path', () => {
    expect(() => validateTargetMatchesPath('cursor', '')).not.toThrow();
  });

  it('validates matching target and path', () => {
    expect(() => validateTargetMatchesPath('cursor', '.cursor/rules')).not.toThrow();
  });

  it('throws error for mismatching target and path', () => {
    expect(() => validateTargetMatchesPath('copilot', '.cursor/rules')).toThrow(
      '--target "copilot" does not match the install path (native path suggests "cursor")',
    );
  });

  it('allows unknown paths', () => {
    expect(() => validateTargetMatchesPath('cursor', 'unknown/path')).not.toThrow();
  });
});

describe('extendPickHasArrays', () => {
  it('returns false for empty pick', () => {
    const empty: ExtendPick = {};
    expect(extendPickHasArrays(empty)).toBe(false);
  });

  it('returns true when commands array has items', () => {
    const withCommands: ExtendPick = { commands: ['cmd1'] };
    expect(extendPickHasArrays(withCommands)).toBe(true);
  });

  it('returns true when rules array has items', () => {
    const withRules: ExtendPick = { rules: ['rule1'] };
    expect(extendPickHasArrays(withRules)).toBe(true);
  });

  it('returns true when skills array has items', () => {
    const withSkills: ExtendPick = { skills: ['skill1'] };
    expect(extendPickHasArrays(withSkills)).toBe(true);
  });

  it('returns true when agents array has items', () => {
    const withAgents: ExtendPick = { agents: ['agent1'] };
    expect(extendPickHasArrays(withAgents)).toBe(true);
  });

  it('returns false for empty arrays', () => {
    const withEmptyArrays: ExtendPick = {
      commands: [],
      rules: [],
      skills: [],
      agents: [],
    };
    expect(extendPickHasArrays(withEmptyArrays)).toBe(false);
  });
});
