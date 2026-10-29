import { describe, expect, it } from 'vitest';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { generateRules } from '../../../../src/targets/kilo-code/generator.js';
import { mergeKiloConfig } from '../../../../src/targets/kilo-code/merge.js';

function input(targets: string[] = []): CanonicalFiles {
  return {
    rules: [{
      source: 'style.md', root: false, description: 'Coding style',
      globs: ['src/**/*.ts'], body: 'Use strict TypeScript.', targets,
    }],
    agents: [], commands: [], skills: [], mcp: null,
    permissions: null, hooks: null, ignore: [],
  };
}
describe('Kilo project rule discovery', () => {
  it('registers generated project rules in the documented kilo.jsonc instructions', () => {
    const outputs = generateRules(input());
    expect(outputs.map(out => out.path).sort()).toEqual([
      '.kilo/rules/style.md', 'kilo.jsonc',
    ]);
    expect(JSON.parse(outputs[1]!.content)).toEqual({
      instructions: ['.kilo/rules/*.md'],
    });
  });
  it('does not register rules in the global config from the project generator', () => {
    const outputs = generateRules(input(), { scope: 'global', capability: {level: 'native'} });
    expect(outputs.map(out => out.path)).toEqual(['.kilo/rules/style.md']);
  });
  it('preserves user-owned configuration while adding project rules', () => {
    const outputs = generateRules(input());
    const registration = outputs.find(out => out.path === 'kilo.jsonc')!;
    const merged = mergeKiloConfig(
      JSON.stringify({ permission: { read: 'allow' }, custom: true }),
      undefined, registration.content, 'kilo.jsonc',
    );
    expect(JSON.parse(merged!)).toEqual({
      permission: { read: 'allow' }, custom: true,
      instructions: ['.kilo/rules/*.md'],
    });
  });
  it('does not register rules targeting another tool', () => {
    expect(generateRules(input(['cursor']))).toEqual([]);
  });
});
