import { afterEach, beforeEach, vi } from 'vitest';
import type { InitCommandResult } from '../../../../src/cli/commands/init.js';
import type { ScaffoldLessonsResult } from '../../../../src/lessons/init.js';

interface CapturedOutput {
  stdout: () => string;
  stderr: () => string;
}

export function useCapturedOutput(): CapturedOutput {
  let stdout: string[] = [];
  let stderr: string[] = [];
  let previousNoColor: string | undefined;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    previousNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
    vi.restoreAllMocks();
  });

  return {
    stdout: () => stdout.join(''),
    stderr: () => stderr.join(''),
  };
}

/** An `init --lessons` retrofit result; `lessons` overrides the scaffold fields. */
export function lessonsInit(lessons: Partial<ScaffoldLessonsResult> = {}): InitCommandResult {
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
