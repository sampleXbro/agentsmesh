// src/cli/commands/init-wizard.ts
/**
 * Interactive init wizard with step-back navigation. Steps run in order, each
 * persisting its answer; a "↩ Back" choice returns to the previous step (prior
 * answers are restored). All answers are collected before any write, so
 * cancelling at any step leaves the tree untouched. Scope-aware: global
 * restricts targets to global-capable tools and skips the Lessons step entirely
 * (lessons is project-only).
 */

import type { ConfigScope, ScopeContext } from '../../config/core/scope.js';
import { BUILTIN_TARGET_IDS } from '../../targets/catalog/target-ids.js';
import {
  starterInitTargetIds,
  globalInitTargetIds,
} from '../../targets/catalog/init-starter-targets.js';
import { runGenerate } from './generate.js';
import {
  applyInitPlan,
  CONFIG_FILENAME,
  LOCAL_CONFIG_FILENAME,
  type InitCommandResult,
  type InitPlan,
} from './init-apply.js';
import type { MultiselectOption, Prompter, SelectOption } from '../prompts/prompter.js';

/** Internal select value for the "↩ Back" choice (cannot collide with a tool id). */
const BACK = '__back__';

/**
 * Selectable targets for the given scope, ordered for discovery. The caller
 * pre-selects the targets detection suggests; the user must still end up with
 * at least one (enforced by the multiselect's `required` flag).
 * - project: every builtin target, recommended (starter) set first then alphabetical.
 * - global: only global-capable targets, alphabetical.
 */
export function buildTargetOptions(scope: ConfigScope): MultiselectOption[] {
  if (scope === 'global') {
    return [...globalInitTargetIds()]
      .sort()
      .map((id) => ({ value: id, label: id, hint: 'global' }));
  }

  const starter = [...starterInitTargetIds()];
  const starterSet = new Set<string>(starter);
  const rest = [...BUILTIN_TARGET_IDS].filter((id) => !starterSet.has(id)).sort();
  return [...starter, ...rest].map((id) => ({
    value: id,
    label: id,
    hint: starterSet.has(id) ? 'recommended' : undefined,
  }));
}

type StepResult = 'next' | 'back' | 'cancel';

interface Answers {
  targets: string[];
  doImport?: boolean;
  lessons?: boolean;
  doGenerate?: boolean;
}

/** A Yes/No question rendered as a select so it can carry a "↩ Back" choice. */
async function yesNoStep(
  prompter: Prompter,
  message: string,
  recommended: boolean,
  prior: boolean | undefined,
  canGoBack: boolean,
  set: (value: boolean) => void,
): Promise<StepResult> {
  const options: SelectOption[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ];
  if (canGoBack) options.push({ value: BACK, label: '↩ Back' });

  const answer = await prompter.select({
    message,
    options,
    initialValue: (prior ?? recommended) ? 'yes' : 'no',
  });
  if (prompter.isCancel(answer)) return 'cancel';
  if (answer === BACK) return 'back';
  set(answer === 'yes');
  return 'next';
}

function cancelledResult(scope: ScopeContext['scope']): InitCommandResult {
  return {
    exitCode: 0,
    data: {
      scope,
      configFile: CONFIG_FILENAME,
      localConfigFile: LOCAL_CONFIG_FILENAME,
      detectedConfigs: [],
      imported: [],
      importedToolCount: 0,
      rootRuleMerged: false,
      sameNameCopies: [],
      targets: [],
      targetSource: 'explicit',
      scaffoldType: 'none',
      gitignoreUpdated: false,
      cancelled: true,
    },
  };
}

export async function runInitWizard(
  prompter: Prompter,
  ctx: {
    projectRoot: string;
    context: ScopeContext;
    detected: readonly string[];
    /** Targets the non-interactive path would have chosen; pre-selected in step 1. */
    suggestedTargets?: readonly string[];
  },
): Promise<InitCommandResult> {
  const scope = ctx.context.scope;
  prompter.intro(scope === 'global' ? 'agentsmesh init --global' : 'agentsmesh init');

  const answers: Answers = { targets: [...(ctx.suggestedTargets ?? [])] };

  // Step list, in display order. Each runs a prompt and returns a navigation
  // result; the loop below moves forward on 'next', backward on 'back'.
  const steps: Array<(canGoBack: boolean) => Promise<StepResult>> = [];

  // 1. Targets (always first → nothing to go back to; selection persists across back).
  steps.push(async () => {
    const answer = await prompter.multiselect({
      message: 'Which tools should agentsmesh generate config for? (select at least one)',
      options: buildTargetOptions(scope),
      initialValues: answers.targets,
      required: true,
    });
    if (prompter.isCancel(answer)) return 'cancel';
    answers.targets = answer as string[];
    return 'next';
  });

  // 2. Import detected configs? (only when something was detected)
  if (ctx.detected.length > 0) {
    steps.push((canGoBack) =>
      yesNoStep(
        prompter,
        `Found existing config for: ${ctx.detected.join(', ')}. Import into .agentsmesh?`,
        true,
        answers.doImport,
        canGoBack,
        (v) => {
          answers.doImport = v;
        },
      ),
    );
  }

  // 3. Lessons (project scope only — never offered in global mode).
  if (scope === 'project') {
    steps.push((canGoBack) =>
      yesNoStep(
        prompter,
        'Enable Lessons (shared memory: recall before edits, capture after failures)?',
        true,
        answers.lessons,
        canGoBack,
        (v) => {
          answers.lessons = v;
        },
      ),
    );
  }

  // 4. Generate now?
  steps.push((canGoBack) =>
    yesNoStep(
      prompter,
      'Run generate now to write tool config files?',
      true,
      answers.doGenerate,
      canGoBack,
      (v) => {
        answers.doGenerate = v;
      },
    ),
  );

  // Drive the machine: forward on 'next', back one step on 'back'.
  for (let pos = 0; pos < steps.length; ) {
    const result = await steps[pos]!(pos > 0);
    if (result === 'cancel') {
      prompter.cancel('Cancelled — no changes written.');
      return cancelledResult(scope);
    }
    pos = result === 'back' ? Math.max(0, pos - 1) : pos + 1;
  }

  // Apply (first disk writes happen here).
  const plan: InitPlan = {
    scope,
    targets: answers.targets,
    // The wizard's selection is the user's own, however it was pre-filled.
    targetSource: 'explicit',
    detected: ctx.detected,
    doImport: answers.doImport ?? false,
    lessons: answers.lessons ?? false,
  };
  const data = await applyInitPlan(ctx.projectRoot, ctx.context, plan);

  const doGenerate = answers.doGenerate ?? false;
  let generatedCount = 0;
  if (doGenerate) {
    const gen = await runGenerate(scope === 'global' ? { global: true } : {}, ctx.projectRoot, {
      printMatrix: false,
    });
    generatedCount = gen.data.summary.created + gen.data.summary.updated;
  }

  const generateCmd = scope === 'global' ? 'agentsmesh generate --global' : 'agentsmesh generate';
  const summary = [`Targets: ${answers.targets.length} (${answers.targets.join(', ')})`];
  if (scope === 'project') {
    summary.push(
      answers.lessons
        ? 'Lessons: enabled'
        : "Lessons: off — add it later with 'agentsmesh init --lessons'",
    );
  }
  summary.push(doGenerate ? `Generated: ${generatedCount} file(s)` : `Next: run '${generateCmd}'`);
  prompter.note(summary.join('\n'), 'Setup complete');
  prompter.outro(`agentsmesh is ready. Edit .agentsmesh/ then run '${generateCmd}' to sync.`);

  return { exitCode: 0, data };
}
