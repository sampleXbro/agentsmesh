import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cmdHandlers } from '../../../src/cli/command-handlers.js';
import { runGenerate } from '../../../src/cli/commands/generate.js';
import { runInit } from '../../../src/cli/commands/init.js';
import { runImport } from '../../../src/cli/commands/import.js';
import { runDiff } from '../../../src/cli/commands/diff.js';
import { runLintCmd } from '../../../src/cli/commands/lint.js';
import { runCheck } from '../../../src/cli/commands/check.js';
import { runMerge } from '../../../src/cli/commands/merge.js';
import { runMatrix } from '../../../src/cli/commands/matrix.js';
import { renderGenerate } from '../../../src/cli/renderers/generate.js';
import { renderInit } from '../../../src/cli/renderers/init.js';
import { renderImport } from '../../../src/cli/renderers/import.js';
import { renderDiff } from '../../../src/cli/renderers/diff.js';
import { renderLint } from '../../../src/cli/renderers/lint.js';
import { renderCheck } from '../../../src/cli/renderers/check.js';
import { renderMerge } from '../../../src/cli/renderers/merge.js';
import { renderMatrix } from '../../../src/cli/renderers/matrix.js';
import { runConvert } from '../../../src/cli/commands/convert.js';
import { renderConvert } from '../../../src/cli/renderers/convert.js';
import { handleResult } from '../../../src/cli/json-handler.js';

const uiCalls: string[] = [];
vi.mock('../../../src/cli/ui/ui.js', () => {
  const sp = {
    start: () => uiCalls.push('spin.start'),
    stop: () => uiCalls.push('spin.stop'),
    message: () => {},
  };
  return {
    ui: {
      intro: () => uiCalls.push('intro'),
      outro: () => uiCalls.push('outro'),
      note: () => uiCalls.push('note'),
      spinner: () => sp,
      success: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      step: () => {},
    },
    createUi: () => ({}),
  };
});
vi.mock('../../../src/cli/commands/generate.js', () => ({ runGenerate: vi.fn() }));
vi.mock('../../../src/cli/commands/init.js', () => ({ runInit: vi.fn() }));
vi.mock('../../../src/cli/commands/import.js', () => ({ runImport: vi.fn() }));
vi.mock('../../../src/cli/commands/diff.js', () => ({ runDiff: vi.fn() }));
vi.mock('../../../src/cli/commands/lint.js', () => ({ runLintCmd: vi.fn() }));
vi.mock('../../../src/cli/commands/check.js', () => ({ runCheck: vi.fn() }));
vi.mock('../../../src/cli/commands/merge.js', () => ({ runMerge: vi.fn() }));
vi.mock('../../../src/cli/commands/matrix.js', () => ({ runMatrix: vi.fn() }));
vi.mock('../../../src/cli/renderers/generate.js', () => ({ renderGenerate: vi.fn() }));
vi.mock('../../../src/cli/renderers/init.js', () => ({ renderInit: vi.fn() }));
vi.mock('../../../src/cli/renderers/import.js', () => ({ renderImport: vi.fn() }));
vi.mock('../../../src/cli/renderers/diff.js', () => ({ renderDiff: vi.fn() }));
vi.mock('../../../src/cli/renderers/lint.js', () => ({ renderLint: vi.fn() }));
vi.mock('../../../src/cli/renderers/check.js', () => ({ renderCheck: vi.fn() }));
vi.mock('../../../src/cli/renderers/merge.js', () => ({ renderMerge: vi.fn() }));
vi.mock('../../../src/cli/renderers/matrix.js', () => ({ renderMatrix: vi.fn() }));
vi.mock('../../../src/cli/commands/convert.js', () => ({ runConvert: vi.fn() }));
vi.mock('../../../src/cli/renderers/convert.js', () => ({ renderConvert: vi.fn() }));
vi.mock('../../../src/cli/json-handler.js', () => ({ handleResult: vi.fn() }));

describe('cmdHandlers', () => {
  const generateResult = {
    exitCode: 0,
    data: {
      scope: 'project' as const,
      mode: 'generate' as const,
      files: [],
      summary: { created: 0, updated: 0, unchanged: 0 },
    },
  };
  const initResult = {
    exitCode: 0,
    data: {
      scope: 'project' as const,
      configFile: 'agentsmesh.yaml',
      localConfigFile: 'agentsmesh.local.yaml',
      detectedConfigs: [],
      imported: [],
      importedToolCount: 0,
      scaffoldType: 'full' as const,
      gitignoreUpdated: false,
    },
  };
  const importResult = {
    exitCode: 0,
    data: { scope: 'project' as const, target: 'cursor', files: [] },
  };
  const diffResult = {
    exitCode: 0,
    data: {
      files: [],
      patches: [],
      summary: { created: 0, updated: 0, unchanged: 0, deleted: 0 },
    },
  };
  const lintResult = {
    exitCode: 0,
    data: { diagnostics: [], summary: { errors: 0, warnings: 0 } },
  };
  const checkResult = {
    exitCode: 0,
    data: {
      hasLock: true,
      inSync: true,
      modified: [],
      added: [],
      removed: [],
      extendsModified: [],
      lockedViolations: [],
    },
  };
  const mergeResult = { exitCode: 0, data: { hadConflict: false, resolved: false } };
  const matrixResult = {
    exitCode: 0,
    data: { targets: ['cursor'], features: [] },
    verboseDetails: 'details',
  };
  const convertResult = {
    exitCode: 0,
    data: {
      from: 'claude-code',
      to: 'cursor',
      mode: 'convert' as const,
      files: [],
      summary: { created: 0, updated: 0, unchanged: 0 },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runGenerate).mockResolvedValue(generateResult);
    vi.mocked(runInit).mockResolvedValue(initResult);
    vi.mocked(runImport).mockResolvedValue(importResult);
    vi.mocked(runDiff).mockResolvedValue(diffResult);
    vi.mocked(runLintCmd).mockResolvedValue(lintResult);
    vi.mocked(runCheck).mockResolvedValue(checkResult);
    vi.mocked(runMerge).mockResolvedValue(mergeResult);
    vi.mocked(runMatrix).mockResolvedValue(matrixResult);
    vi.mocked(runConvert).mockResolvedValue(convertResult);
    vi.mocked(handleResult).mockImplementation((_command, _result, flags, render) => {
      if (flags.json !== true) render();
    });
  });

  it('maps generate JSON mode to non-printing generation', async () => {
    await cmdHandlers.generate({ json: true }, []);

    expect(runGenerate).toHaveBeenCalledWith({ json: true }, undefined, { printMatrix: false });
    expect(handleResult).toHaveBeenCalledWith(
      'generate',
      generateResult,
      { json: true },
      expect.any(Function),
    );
    expect(renderGenerate).not.toHaveBeenCalled();
  });

  it('renders generate output in text mode and keeps matrix printing enabled', async () => {
    await cmdHandlers.generate({}, []);

    expect(runGenerate).toHaveBeenCalledWith({}, undefined, { printMatrix: false });
    expect(renderGenerate).toHaveBeenCalledWith(generateResult);
    // The matrix is rendered AFTER the spinner/frame closes (not during runGenerate).
    expect(runMatrix).toHaveBeenCalled();
    expect(renderMatrix).toHaveBeenCalled();
  });

  it('maps init flags to typed options', async () => {
    await cmdHandlers.init({ yes: true, global: true }, []);
    await cmdHandlers.init({}, []);
    await cmdHandlers.init({ lessons: true }, []);

    // Non-TTY test runs → interactive=false → no prompter injected (third arg is {}).
    expect(runInit).toHaveBeenNthCalledWith(
      1,
      process.cwd(),
      {
        yes: true,
        global: true,
        lessons: false,
        targets: undefined,
        allTargets: false,
      },
      {},
    );
    expect(runInit).toHaveBeenNthCalledWith(
      2,
      process.cwd(),
      {
        yes: false,
        global: false,
        lessons: false,
        targets: undefined,
        allTargets: false,
      },
      {},
    );
    expect(runInit).toHaveBeenNthCalledWith(
      3,
      process.cwd(),
      {
        yes: false,
        global: false,
        lessons: true,
        targets: undefined,
        allTargets: false,
      },
      {},
    );
    expect(renderInit).toHaveBeenCalledTimes(3);
  });

  it('renders the lessons-only retrofit even on an interactive TTY (output not swallowed)', async () => {
    const stdin = process.stdin.isTTY;
    const stdout = process.stdout.isTTY;
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    try {
      vi.mocked(runInit).mockResolvedValueOnce({
        exitCode: 0,
        data: {
          ...initResult.data,
          scaffoldType: 'none',
          lessonsOnly: true,
          lessons: {
            created: [],
            updated: [],
            skipped: [],
            rootRuleUpdated: false,
            gitignoreUpdated: false,
            recallHookInjected: false,
          },
        },
      });
      await cmdHandlers.init({ lessons: true }, []);
      // Retrofit returns without a wizard → its summary must still be rendered.
      expect(renderInit).toHaveBeenCalledTimes(1);
    } finally {
      process.stdin.isTTY = stdin;
      process.stdout.isTTY = stdout;
    }
  });

  it('suppresses renderInit when the wizard actually ran on an interactive TTY', async () => {
    const stdin = process.stdin.isTTY;
    const stdout = process.stdout.isTTY;
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    try {
      // default initResult (lessonsOnly undefined) → wizard path → clack rendered.
      await cmdHandlers.init({}, []);
      expect(renderInit).not.toHaveBeenCalled();
    } finally {
      process.stdin.isTTY = stdin;
      process.stdout.isTTY = stdout;
    }
  });

  it('delegates import, diff, lint, check, and merge to their renderers', async () => {
    await cmdHandlers.import({ from: 'cursor' }, []);
    await cmdHandlers.diff({ targets: 'cursor' }, []);
    await cmdHandlers.lint({ targets: 'cursor' }, []);
    await cmdHandlers.check({}, []);
    await cmdHandlers.merge({}, []);

    expect(runImport).toHaveBeenCalledWith({ from: 'cursor' });
    expect(renderImport).toHaveBeenCalledWith(importResult);
    expect(runDiff).toHaveBeenCalledWith({ targets: 'cursor' });
    expect(renderDiff).toHaveBeenCalledWith(diffResult);
    expect(runLintCmd).toHaveBeenCalledWith({ targets: 'cursor' });
    expect(renderLint).toHaveBeenCalledWith(lintResult);
    expect(runCheck).toHaveBeenCalledWith({});
    expect(renderCheck).toHaveBeenCalledWith(checkResult);
    expect(runMerge).toHaveBeenCalledWith({});
    expect(renderMerge).toHaveBeenCalledWith(mergeResult);
  });

  it('passes verbose matrix rendering only when requested', async () => {
    await cmdHandlers.matrix({ verbose: true }, []);
    await cmdHandlers.matrix({}, []);

    expect(renderMatrix).toHaveBeenNthCalledWith(1, matrixResult, { verbose: true });
    expect(renderMatrix).toHaveBeenNthCalledWith(2, matrixResult, { verbose: false });
  });

  it('delegates convert to runConvert and renderConvert', async () => {
    await cmdHandlers.convert({ from: 'claude-code', to: 'cursor' }, []);

    expect(runConvert).toHaveBeenCalledWith({ from: 'claude-code', to: 'cursor' });
    expect(handleResult).toHaveBeenCalledWith(
      'convert',
      convertResult,
      { from: 'claude-code', to: 'cursor' },
      expect.any(Function),
    );
    expect(renderConvert).toHaveBeenCalledWith(convertResult);
  });

  it('frames the generate run with ui intro, spinner, and outro', async () => {
    uiCalls.length = 0;
    await cmdHandlers.generate({}, []);
    expect(uiCalls).toEqual(['intro', 'spin.start', 'spin.stop', 'outro']);
  });
});
