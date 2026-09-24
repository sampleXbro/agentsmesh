import { describe, expect, it } from 'vitest';
import { renderInit } from '../../../../src/cli/renderers/init.js';
import type { InitCommandResult } from '../../../../src/cli/commands/init.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

function initWith(sameNameCopies: InitCommandResult['data']['sameNameCopies']): InitCommandResult {
  return {
    exitCode: 0,
    data: {
      scope: 'project',
      configFile: 'agentsmesh.yaml',
      localConfigFile: 'agentsmesh.local.yaml',
      detectedConfigs: ['claude-code', 'cursor'],
      imported: [{ from: '.cursor/rules/ts.mdc', to: '.agentsmesh/rules/ts-cursor.md' }],
      importedToolCount: 2,
      rootRuleMerged: false,
      sameNameCopies,
      targets: ['claude-code', 'cursor'],
      targetSource: 'project',
      scaffoldType: 'gap-fill',
      gitignoreUpdated: false,
    },
  };
}

describe('renderInit same-name copies', () => {
  const output = useCapturedOutput();

  it('names each kept copy and asks for a review', () => {
    renderInit(
      initWith([
        { path: '.agentsmesh/rules/ts.md', copy: '.agentsmesh/rules/ts-cursor.md', tool: 'cursor' },
      ]),
    );

    expect(output.stderr()).toBe(
      '⚠ .agentsmesh/rules/ts.md: another tool had a different text with the same name, so ' +
        "cursor's version was saved as .agentsmesh/rules/ts-cursor.md. Review both, then merge " +
        "or delete one before running 'agentsmesh generate'.\n",
    );
  });

  it('prints nothing extra when there are no copies', () => {
    renderInit(initWith([]));

    expect(output.stderr()).toBe('');
  });
});
