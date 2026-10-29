import { describe, expect, it } from 'vitest';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { generateRules } from '../../../../src/targets/antigravity/generator.js';

function canonical(rules: CanonicalFiles['rules']): CanonicalFiles {
  return { rules, commands: [], agents: [], skills: [], mcp: null, hooks: null,
    ignore: [], permissions: null };
}
const root = { source: '.agentsmesh/rules/_root.md', root: true, targets: [],
  description: 'Root instructions', globs: [], body: 'Use TDD.' };
const scoped = { source: '.agentsmesh/rules/typescript.md', root: false, targets: [],
  description: 'TypeScript guidelines', globs: ['src/**/*.ts', 'test/*.ts'],
  body: 'Use strict TypeScript.' };
describe('Antigravity documented rules format', () => {
  it('sets always_on trigger for root .agents/rules/general.md', () => {
    const files = generateRules(canonical([root]));
    expect(files[0]!.content).toContain('trigger: always_on');
    expect(files[0]!.path).toBe('.agents/rules/general.md');
  });
  it('sets glob trigger and comma-separated globs on non-root rules', () => {
    const files = generateRules(canonical([scoped]));
    expect(files).toHaveLength(1);
    const rule = files[0]!;
    expect(rule.path).toBe('.agents/rules/typescript.md');
    expect(rule.content).toContain('trigger: glob');
    expect(rule.content).toContain('globs:');
    expect(rule.content).toContain('src/**/*.ts, test/*.ts');
    expect(rule.content).toContain('Use strict TypeScript.');
  });
  it('sets always_on trigger for rules without globs', () => {
    const files = generateRules(canonical([{ ...scoped, globs: [] }]));
    expect(files[0]!.content).toContain('trigger: always_on');
  });
});
