import { describe, expect, it } from 'vitest';
import { renderInit } from '../../../../src/cli/renderers/init.js';
import type { InitCommandResult } from '../../../../src/cli/commands/init.js';
import { RECALL_HOOK_TEAM_HINT } from '../../../../src/lessons/recall-hook-hint.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

function lessonsInit(lessons: Record<string, unknown>): InitCommandResult {
  return {
    exitCode: 0,
    data: {
      scope: 'project',
      configFile: 'agentsmesh.yaml',
      localConfigFile: 'agentsmesh.local.yaml',
      detectedConfigs: [],
      imported: [],
      importedToolCount: 0,
      targets: [],
      targetSource: 'explicit',
      scaffoldType: 'none',
      gitignoreUpdated: false,
      lessonsOnly: true,
      lessons: {
        created: [],
        updated: [],
        skipped: [],
        rootRuleUpdated: false,
        gitignoreUpdated: false,
        gitattributesUpdated: false,
        recallHookInjected: true,
        ...lessons,
      },
    },
  } as InitCommandResult;
}

describe('renderInit — lessons recall hook', () => {
  const output = useCapturedOutput();

  it('names the recall hook without claiming a single PostToolUse event', () => {
    renderInit(lessonsInit({}));
    const stdout = output.stdout();
    expect(stdout).toContain(
      'Wired the lessons recall hook into .agentsmesh/hooks.yaml (deterministic recall on targets whose hooks can inject context)',
    );
    expect(stdout).not.toContain('PostToolUse');
  });

  it('warns the team when recall hooks call a global agentsmesh', () => {
    renderInit(lessonsInit({ recallHookTeamHint: RECALL_HOOK_TEAM_HINT }));
    expect(output.stderr()).toContain(`⚠   ${RECALL_HOOK_TEAM_HINT}\n`);
  });

  it('prints no team warning when there is no hint', () => {
    renderInit(lessonsInit({ recallHookTeamHint: null }));
    expect(output.stderr()).toBe('');
  });
});
