/**
 * agentsmesh init — create agentsmesh.yaml and .agentsmesh/ scaffold.
 * With --yes: auto-import detected configs, then add example scaffold only where canonical paths stayed empty.
 * On a project-scope TTY (no --yes/--json/--global), the command handler injects a Prompter and the
 * interactive wizard runs instead — see init-wizard.ts.
 */

import { join } from 'node:path';
import { exists } from '../../utils/filesystem/fs.js';
import type { BuiltinTargetId } from '../../targets/catalog/target-ids.js';
import { globalInitTargetIds } from '../../targets/catalog/init-starter-targets.js';
import { resolveScopeContext, type ConfigScope } from '../../config/core/scope.js';
import { scaffoldLessons } from '../../lessons/init.js';
import { detectExistingConfigs } from './init-detect.js';
import { resolveInitTargets } from './init-target-resolution.js';
import {
  applyInitPlan,
  CONFIG_FILENAME,
  LOCAL_CONFIG_FILENAME,
  type InitCommandResult,
  type InitPlan,
} from './init-apply.js';
import { runInitWizard } from './init-wizard.js';
import type { Prompter } from '../prompts/prompter.js';

export type { InitCommandResult } from './init-apply.js';
export { detectExistingConfigs };

const GLOBAL_INIT_TARGETS: readonly BuiltinTargetId[] = globalInitTargetIds();

/**
 * Tools installed for this user, found by running each descriptor's global
 * detection paths against the home directory. Used only to pick sensible
 * targets for a project that has no tool config of its own — nothing is ever
 * imported from the home directory into a project.
 */
async function detectMachineTools(projectRoot: string): Promise<string[]> {
  const home = resolveScopeContext(projectRoot, 'global');
  return detectExistingConfigs(home.rootBase, 'global');
}

/**
 * Run the init command.
 * @throws Error if already initialized (unless --lessons retrofits an existing init).
 */
export async function runInit(
  projectRoot: string,
  options: {
    yes?: boolean;
    global?: boolean;
    lessons?: boolean;
    targets?: readonly string[];
    allTargets?: boolean;
  } = {},
  deps: { prompter?: Prompter } = {},
): Promise<InitCommandResult> {
  const scope: ConfigScope = options.global === true ? 'global' : 'project';
  const wantLessons = options.lessons === true;

  if (wantLessons && scope === 'global') {
    throw new Error('--lessons is project-mode only. Lessons live in the project tree.');
  }

  const context = resolveScopeContext(projectRoot, scope);
  const configPath = join(context.configDir, CONFIG_FILENAME);
  const alreadyInitialized = await exists(configPath);

  // Lessons-only retrofit: already-initialized project + --lessons.
  if (alreadyInitialized && wantLessons) {
    const lessons = await scaffoldLessons(projectRoot);
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
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'none',
        gitignoreUpdated: false,
        lessons,
        lessonsOnly: true,
      },
    };
  }

  if (alreadyInitialized) {
    throw new Error(
      `Already initialized. ${CONFIG_FILENAME} exists. Edit it directly, or use ` +
        "`agentsmesh import` to pull in another tool's config. Deleting it and re-running " +
        '`init` is not a reset: your canonical files in `.agentsmesh/` are kept, not rebuilt.',
    );
  }

  const detected = await detectExistingConfigs(context.rootBase, scope);
  const existing =
    scope === 'global'
      ? detected.filter((target): target is BuiltinTargetId =>
          GLOBAL_INIT_TARGETS.includes(target as BuiltinTargetId),
        )
      : detected;

  // Interactive wizard: prompter injected (project or global), not --yes.
  // The wizard itself is scope-aware (global skips the lessons step).
  if (deps.prompter !== undefined && options.yes !== true) {
    return runInitWizard(deps.prompter, {
      projectRoot,
      context,
      detected: existing,
      // Pre-select the same targets the non-interactive path would pick, so
      // both entry points agree on what a sensible default looks like.
      suggestedTargets: resolveInitTargets({
        projectDetected: existing,
        machineDetected: scope === 'global' ? [] : await detectMachineTools(projectRoot),
        allowed: scope === 'global' ? GLOBAL_INIT_TARGETS : undefined,
      }).targets,
    });
  }

  const doImport = existing.length > 0 && options.yes === true;
  const resolved = resolveInitTargets({
    explicit: options.targets,
    allTargets: options.allTargets,
    projectDetected: existing,
    // Global scope already detects against the home directory, so a second
    // machine pass would just repeat `existing`.
    machineDetected: scope === 'global' ? [] : await detectMachineTools(projectRoot),
    allowed: scope === 'global' ? GLOBAL_INIT_TARGETS : undefined,
  });

  const plan: InitPlan = {
    scope,
    targets: resolved.targets,
    targetSource: resolved.source,
    detected: existing,
    doImport,
    lessons: wantLessons,
  };
  const data = await applyInitPlan(projectRoot, context, plan);
  return { exitCode: 0, data };
}
