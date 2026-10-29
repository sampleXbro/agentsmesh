import { describe, expect, it } from 'vitest';
import { getTargetCapabilities } from '../../../../src/targets/catalog/builtin-targets.js';
import { generateIgnore as gooseIgnore } from '../../../../src/targets/goose/generator.js';
import { buildRovodevConfig } from '../../../../src/targets/rovodev/settings.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

const cases: readonly [string, 'project' | 'global', string, string][] = [
  ['aider', 'project', 'mcp', 'none'],
  ['aider', 'global', 'mcp', 'none'],
  ['kilo-code', 'project', 'hooks', 'none'],
  ['kilo-code', 'global', 'hooks', 'none'],
  ['replit-agent', 'project', 'hooks', 'none'],
  ['replit-agent', 'project', 'ignore', 'none'],
  ['amp', 'project', 'ignore', 'none'],
  ['amp', 'global', 'ignore', 'none'],
  ['deepagents-cli', 'project', 'ignore', 'none'],
  ['deepagents-cli', 'global', 'ignore', 'none'],
  ['deepagents-cli', 'project', 'permissions', 'none'],
  ['factory-droid', 'project', 'ignore', 'none'],
  ['factory-droid', 'global', 'ignore', 'none'],
  ['goose', 'project', 'ignore', 'none'],
  ['goose', 'global', 'ignore', 'none'],
  ['goose', 'project', 'permissions', 'none'],
  ['jules', 'project', 'ignore', 'none'],
  ['rovodev', 'project', 'ignore', 'none'],
  ['rovodev', 'global', 'ignore', 'none'],
  ['junie', 'project', 'permissions', 'none'],
  ['rovodev', 'global', 'hooks', 'partial'],
  ['cursor', 'global', 'ignore', 'partial'],
  ['claude-code', 'project', 'ignore', 'embedded'],
  ['claude-code', 'global', 'ignore', 'embedded'],
];

function canonical(): CanonicalFiles {
  return {
    rules: [], commands: [], agents: [], skills: [], mcp: null,
    permissions: null, hooks: { PreToolUse: [{ matcher: '*', command: 'echo hook', type: 'command' }] },
    ignore: ['.env'],
  };
}
describe('disputed capabilities obey primary-source limits', () => {
  it.each(cases)('%s %s %s must be %s', (target, scope, key, level) => {
    const capability = getTargetCapabilities(target, scope);
    expect(capability?.[key as keyof typeof capability]?.level).toBe(level);
  });

  it('Goose no longer emits ignored .gooseignore files', () => {
    expect(gooseIgnore(canonical())).toEqual([]);
  });

  it('Rovo global config does not fabricate unsupported eventHooks', () => {
    expect(buildRovodevConfig(canonical(), new Set(['hooks']))).toEqual([]);
  });
});
