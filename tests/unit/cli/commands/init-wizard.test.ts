import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveScopeContext } from '../../../../src/config/core/scope.js';
import { runInitWizard, buildTargetOptions } from '../../../../src/cli/commands/init-wizard.js';
import type { MultiselectOptions, Prompter } from '../../../../src/cli/prompts/prompter.js';
import { BUILTIN_TARGET_IDS } from '../../../../src/targets/catalog/target-ids.js';
import {
  starterInitTargetIds,
  globalInitTargetIds,
} from '../../../../src/targets/catalog/init-starter-targets.js';

const TEST_DIR = join(tmpdir(), 'am-init-wizard-test');
const CANCEL = Symbol('cancel');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

interface Scripted {
  import?: boolean | symbol;
  targets?: string[] | symbol;
  lessons?: boolean | symbol;
  generate?: boolean | symbol;
}

function choice(v: boolean | symbol): string | symbol {
  return typeof v === 'symbol' ? v : v ? 'yes' : 'no';
}

// Answers the yes/no `select` steps by message; multiselect returns scripted targets.
function fakePrompter(a: Scripted): Prompter {
  return {
    intro: () => {},
    outro: () => {},
    note: () => {},
    cancel: () => {},
    isCancel: (v) => v === CANCEL,
    multiselect: async () => a.targets ?? [],
    select: async ({ message }) => {
      if (message.startsWith('Found existing')) return choice(a.import ?? true);
      if (message.startsWith('Enable Lessons')) return choice(a.lessons ?? true);
      if (message.startsWith('Run generate')) return choice(a.generate ?? false);
      throw new Error(`unexpected select: ${message}`);
    },
  };
}

describe('buildTargetOptions', () => {
  it('project: lists every builtin target once, recommended set first then alphabetical', () => {
    const values = buildTargetOptions('project').map((o) => o.value);
    const starter = [...starterInitTargetIds()];
    expect(new Set(values).size).toBe(values.length);
    expect([...values].sort()).toEqual([...BUILTIN_TARGET_IDS].sort());
    expect(values.slice(0, starter.length)).toEqual(starter);
  });

  it('global: only global-capable targets, a strict subset', () => {
    const values = buildTargetOptions('global').map((o) => o.value);
    expect([...values].sort()).toEqual([...globalInitTargetIds()].sort());
    expect(values.length).toBeGreaterThan(0);
    expect(values.length).toBeLessThan(BUILTIN_TARGET_IDS.length);
  });
});

describe('runInitWizard — pre-selected targets', () => {
  it('offers the suggested targets as the initial multiselect selection', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    let seen: readonly string[] | undefined;
    const prompter = fakePrompter({ targets: ['claude-code'], lessons: false, generate: false });
    const spy: Prompter = {
      ...prompter,
      multiselect: async (opts: MultiselectOptions) => {
        seen = opts.initialValues;
        return ['claude-code'];
      },
    };

    await runInitWizard(spy, {
      projectRoot: TEST_DIR,
      context,
      detected: [],
      suggestedTargets: ['claude-code', 'cursor'],
    });

    expect(seen).toEqual(['claude-code', 'cursor']);
  });

  it('starts from an empty selection when nothing is suggested', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    let seen: readonly string[] | undefined;
    const prompter = fakePrompter({ targets: ['zed'], lessons: false, generate: false });
    const spy: Prompter = {
      ...prompter,
      multiselect: async (opts: MultiselectOptions) => {
        seen = opts.initialValues;
        return ['zed'];
      },
    };

    await runInitWizard(spy, { projectRoot: TEST_DIR, context, detected: [] });

    expect(seen).toEqual([]);
  });

  it('still writes whatever the user ends up selecting, not the suggestion', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    const result = await runInitWizard(
      fakePrompter({ targets: ['zed'], lessons: false, generate: false }),
      {
        projectRoot: TEST_DIR,
        context,
        detected: [],
        suggestedTargets: ['claude-code', 'cursor'],
      },
    );

    expect(result.data.targets).toEqual(['zed']);
    const config = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(config).toContain('- zed');
    expect(config).not.toContain('- claude-code');
  });
});

describe('runInitWizard (project)', () => {
  it('writes config with exactly the selected targets, scaffolds lessons, skips generate', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    const result = await runInitWizard(
      fakePrompter({ targets: ['claude-code', 'cursor'], lessons: true, generate: false }),
      { projectRoot: TEST_DIR, context, detected: [] },
    );

    expect(result.exitCode).toBe(0);
    expect(result.data.cancelled).toBeUndefined();
    const config = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(config).toContain('- claude-code');
    expect(config).toContain('- cursor');
    expect(config).not.toContain('- gemini-cli');
    expect(result.data.scaffoldType).toBe('full');
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'lessons', 'lessons.json'))).toBe(true);
  });

  it('imports detected tools and gap-fills when the user accepts import', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# My Rules\n\nUse TDD.');
    const context = resolveScopeContext(TEST_DIR, 'project');
    const result = await runInitWizard(
      fakePrompter({ import: true, targets: ['claude-code'], lessons: false, generate: false }),
      { projectRoot: TEST_DIR, context, detected: ['claude-code'] },
    );
    expect(result.data.scaffoldType).toBe('gap-fill');
    const root = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(root).toContain('My Rules');
    expect(result.data.lessons).toBeUndefined();
  });

  it('hints how to add lessons later when the user declines them', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    let note = '';
    const prompter: Prompter = {
      ...fakePrompter({ targets: ['claude-code'], lessons: false, generate: false }),
      note: (message) => {
        note = message;
      },
    };
    await runInitWizard(prompter, {
      projectRoot: TEST_DIR,
      context,
      detected: [],
    });
    expect(note).toContain('agentsmesh init --lessons');
  });

  it('pre-selects no targets and requires at least one (even when configs are detected)', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    let captured: MultiselectOptions | undefined;
    const prompter: Prompter = {
      ...fakePrompter({ import: true, targets: ['claude-code'], lessons: false, generate: false }),
      multiselect: async (opts) => {
        captured = opts;
        return ['claude-code'];
      },
    };
    await runInitWizard(prompter, {
      projectRoot: TEST_DIR,
      context,
      detected: ['claude-code'],
    });
    expect(captured?.required).toBe(true);
    expect(captured?.initialValues ?? []).toEqual([]); // nothing pre-checked
  });

  it('lets the user go Back to a prior step; the selection persists and the new answer wins', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    // No detected configs → steps: Targets, Lessons, Generate.
    const multiselectReturns = [['claude-code'], ['cursor']];
    const selectReturns = ['__back__', 'no', 'no']; // Lessons→Back, Lessons→no, Generate→no
    let msCall = 0;
    let selCall = 0;
    const initialValuesSeen: (readonly string[] | undefined)[] = [];
    const prompter: Prompter = {
      intro: () => {},
      outro: () => {},
      note: () => {},
      cancel: () => {},
      isCancel: () => false,
      multiselect: async (opts) => {
        initialValuesSeen.push(opts.initialValues);
        return multiselectReturns[msCall++]!;
      },
      select: async () => selectReturns[selCall++]!,
    };

    await runInitWizard(prompter, {
      projectRoot: TEST_DIR,
      context,
      detected: [],
    });

    // Targets was shown twice (Back re-ran it); the revisit restored the prior pick.
    expect(msCall).toBe(2);
    expect(initialValuesSeen[0]).toEqual([]); // first visit: nothing pre-checked
    expect(initialValuesSeen[1]).toEqual(['claude-code']); // back-revisit: prior pick restored
    // The corrected target wins.
    const config = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(config).toContain('- cursor');
    expect(config).not.toContain('- claude-code');
  });

  it('cancels cleanly at target selection — nothing written', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    const result = await runInitWizard(fakePrompter({ targets: CANCEL }), {
      projectRoot: TEST_DIR,
      context,
      detected: [],
    });
    expect(result.data.cancelled).toBe(true);
    expect(existsSync(join(TEST_DIR, 'agentsmesh.yaml'))).toBe(false);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('runs generate when the user accepts: writes target artifacts and reports the count', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    let note = '';
    const prompter: Prompter = {
      ...fakePrompter({ targets: ['claude-code'], lessons: false, generate: true }),
      note: (message) => {
        note = message;
      },
    };
    const result = await runInitWizard(prompter, {
      projectRoot: TEST_DIR,
      context,
      detected: [],
    });

    expect(result.exitCode).toBe(0);
    expect(result.data.cancelled).toBeUndefined();
    // Generate step ran: summary reports the exact file count, not the "Next: run" hint.
    // The starter scaffold has only underscore-prefixed examples (not emitted), so
    // claude-code writes exactly two real artifacts: CLAUDE.md and .mcp.json.
    expect(note).toContain('Generated: 2 file(s)');
    expect(note).not.toContain("Next: run 'agentsmesh generate'");
    expect(existsSync(join(TEST_DIR, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.mcp.json'))).toBe(true);
  });

  it('cancels cleanly at a yes/no step — nothing written', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    // Targets chosen, then the user cancels (Ctrl-C) at the Lessons yes/no step.
    const result = await runInitWizard(
      fakePrompter({ targets: ['claude-code'], lessons: CANCEL }),
      { projectRoot: TEST_DIR, context, detected: [] },
    );
    expect(result.data.cancelled).toBe(true);
    expect(existsSync(join(TEST_DIR, 'agentsmesh.yaml'))).toBe(false);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('restores a prior No answer when a yes/no step is revisited via Back', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    // Steps (no detected configs): Targets, Lessons, Generate.
    // Lessons=no, then Back from Generate to Lessons: the revisit must default to the
    // prior "no" (the `prior ?? recommended` branch + the ternary 'no'), not recommended "yes".
    const selectReturns = ['no', '__back__', 'no', 'no'];
    let selCall = 0;
    const initialValuesSeen: (string | undefined)[] = [];
    const prompter: Prompter = {
      intro: () => {},
      outro: () => {},
      note: () => {},
      cancel: () => {},
      isCancel: () => false,
      multiselect: async () => ['claude-code'],
      select: async ({ initialValue }) => {
        initialValuesSeen.push(initialValue);
        return selectReturns[selCall++]!;
      },
    };

    await runInitWizard(prompter, {
      projectRoot: TEST_DIR,
      context,
      detected: [],
    });

    expect(initialValuesSeen[0]).toBe('yes'); // Lessons first visit → recommended default
    expect(initialValuesSeen[2]).toBe('no'); // Lessons revisit after Back → prior 'no' restored
  });
});

describe('runInitWizard (global) — interactive, but no lessons', () => {
  it('restricts to global targets, never asks about lessons, writes home config, scaffolds none', async () => {
    const home = join(TEST_DIR, 'home');
    const workspace = join(TEST_DIR, 'workspace');
    mkdirSync(workspace, { recursive: true });
    const globalDir = join(home, '.agentsmesh');
    const context = {
      scope: 'global' as const,
      rootBase: home,
      configDir: globalDir,
      canonicalDir: globalDir,
    };

    const asked: string[] = [];
    const prompter: Prompter = {
      intro: () => {},
      outro: () => {},
      note: () => {},
      cancel: () => {},
      isCancel: () => false,
      select: async ({ message }) => {
        asked.push(message);
        return 'no'; // decline generate (and import, though none is detected)
      },
      multiselect: async () => ['claude-code'],
    };

    const result = await runInitWizard(prompter, {
      projectRoot: workspace,
      context,
      detected: [],
    });

    expect(result.data.scope).toBe('global');
    expect(asked.some((m) => m.startsWith('Enable Lessons'))).toBe(false);
    expect(result.data.lessons).toBeUndefined();
    const config = readFileSync(join(globalDir, 'agentsmesh.yaml'), 'utf-8');
    expect(config).toContain('- claude-code');
    expect(existsSync(join(workspace, '.agentsmesh', 'lessons', 'lessons.json'))).toBe(false);
    expect(existsSync(join(globalDir, 'lessons', 'lessons.json'))).toBe(false);
  });

  it('runs generate in global scope when accepted: passes { global: true } and reports the count', async () => {
    const home = join(TEST_DIR, 'home');
    const workspace = join(TEST_DIR, 'workspace');
    mkdirSync(workspace, { recursive: true });
    const globalDir = join(home, '.agentsmesh');
    // runGenerate re-resolves global scope via os.homedir(); point it at our temp home
    // so the in-process generate loads the config applyInitPlan just wrote under globalDir.
    const savedHome = process.env.HOME;
    const savedUserProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const context = {
        scope: 'global' as const,
        rootBase: home,
        configDir: globalDir,
        canonicalDir: globalDir,
      };
      let note = '';
      const prompter: Prompter = {
        intro: () => {},
        outro: () => {},
        note: (message) => {
          note = message;
        },
        cancel: () => {},
        isCancel: () => false,
        select: async () => 'yes', // accept generate
        multiselect: async () => ['claude-code'],
      };

      const result = await runInitWizard(prompter, {
        projectRoot: workspace,
        context,
        detected: [],
      });

      expect(result.data.scope).toBe('global');
      // Config landed in the global dir, and the generate step ran with the exact count.
      const config = readFileSync(join(globalDir, 'agentsmesh.yaml'), 'utf-8');
      expect(config).toContain('- claude-code');
      // claude-code global emits exactly two artifacts under home: .claude/CLAUDE.md and .claude.json.
      expect(note).toContain('Generated: 2 file(s)');
      expect(note).not.toContain("Next: run 'agentsmesh generate --global'");
      expect(existsSync(join(home, '.claude', 'CLAUDE.md'))).toBe(true);
      expect(existsSync(join(home, '.claude.json'))).toBe(true);
    } finally {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      if (savedUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = savedUserProfile;
    }
  });
});
