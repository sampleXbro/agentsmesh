import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { buildOutputSourceMap } from '../../../src/core/reference/output-source-map.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../src/core/types.js';

function config(target: string): ValidatedConfig {
  return {
    version: 1,
    targets: [target] as ValidatedConfig['targets'],
    features: ['rules', 'skills'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
  };
}

function canonical(): CanonicalFiles {
  return {
    rules: [
      {
        source: join('/repo/.agentsmesh/rules/_root.md'),
        root: true,
        targets: [],
        description: '',
        globs: [],
        body: '',
      },
      {
        source: join('/repo/.agentsmesh/rules/typescript.md'),
        root: false,
        targets: [],
        description: '',
        globs: ['src/**/*.ts'],
        body: '',
      },
      {
        source: join('/repo/.agentsmesh/rules/execution.md'),
        root: false,
        targets: [],
        description: '',
        globs: [],
        codexEmit: 'execution',
        body: '',
      },
    ],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

describe('buildOutputSourceMap', () => {
  it('maps windsurf root and rule outputs, and no nested AGENTS.md it no longer writes', () => {
    const sourceMap = buildOutputSourceMap('windsurf', canonical(), config('windsurf'));

    expect(sourceMap.get('AGENTS.md')).toBe(join('/repo/.agentsmesh/rules/_root.md'));
    expect(sourceMap.get('.windsurf/rules/typescript.md')).toBe(
      join('/repo/.agentsmesh/rules/typescript.md'),
    );
    expect(sourceMap.has('src/AGENTS.md')).toBe(false);
  });

  it('uses descriptor-declared rule extra outputs for source ownership', () => {
    const sourceMap = buildOutputSourceMap('codex-cli', canonical(), config('codex-cli'));

    expect(sourceMap.get('src/AGENTS.md')).toBe(join('/repo/.agentsmesh/rules/typescript.md'));
  });

  it('maps target-specific rule outputs without target switches in core', () => {
    const copilotMap = buildOutputSourceMap('copilot', canonical(), config('copilot'));
    const geminiCanonical = canonical();
    geminiCanonical.rules = [geminiCanonical.rules[1]!];
    const geminiMap = buildOutputSourceMap('gemini-cli', geminiCanonical, config('gemini-cli'));
    const codexMap = buildOutputSourceMap('codex-cli', canonical(), config('codex-cli'));

    expect(copilotMap.get('.github/instructions/typescript.instructions.md')).toBe(
      join('/repo/.agentsmesh/rules/typescript.md'),
    );
    expect(geminiMap.get('AGENTS.md')).toBe(join('/repo/.agentsmesh/rules/typescript.md'));
    expect(codexMap.get('.codex/rules/execution.rules')).toBe(
      join('/repo/.agentsmesh/rules/execution.md'),
    );
  });
});
