// src/cli/commands/init-apply.ts
/**
 * Shared init writer: import (optional) + scaffold + config + local + gitignore + lessons.
 * Both the non-interactive default path and the interactive wizard build an
 * InitPlan and apply it here, so the two share one source of truth.
 * `generate` is NOT run here — the wizard owns that step.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';
import { ensureGitignoreEntries } from '../../utils/filesystem/gitignore.js';
import { BUILTIN_TARGETS } from '../../targets/catalog/builtin-targets.js';
import type { ImportResult } from '../../core/types.js';
import { buildConfig, LOCAL_TEMPLATE } from './init-templates.js';
import { writeScaffoldFull, writeScaffoldGapFill } from './init-scaffold.js';
import type { ConfigScope, ScopeContext } from '../../config/core/scope.js';
import { scaffoldLessons } from '../../lessons/init.js';
import type { InitData } from '../command-result.js';
import type { InitTargetSource } from './init-target-resolution.js';
import { AB_ROOT_RULE } from '../../core/canonical-paths.js';
import { rootRuleBodyGrew } from '../../targets/import/root-rule-body-merge.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';

export interface InitCommandResult {
  exitCode: number;
  data: InitData;
}

export const CONFIG_FILENAME = 'agentsmesh.yaml';
export const LOCAL_CONFIG_FILENAME = 'agentsmesh.local.yaml';

// Packs are materialized derivatives of installs.yaml (same model as node_modules);
// generated target folders stay committed for fresh-clone UX.
const GITIGNORE_ENTRIES = [
  'agentsmesh.local.yaml',
  '.agentsmeshcache',
  '.agentsmesh/.lock.tmp',
  '.agentsmesh/packs/',
];

/** Importers derived from target descriptors — no manual registration needed. */
const IMPORTERS: Record<string, (root: string, scope: ConfigScope) => Promise<ImportResult[]>> =
  Object.fromEntries(
    BUILTIN_TARGETS.map((d) => [
      d.id,
      (root: string, scope: ConfigScope) => d.generators.importFrom(root, { scope }),
    ]),
  );

export interface InitPlan {
  scope: ConfigScope;
  /** Target IDs written to agentsmesh.yaml; always at least one. */
  targets: readonly string[];
  /** Which rule picked `targets`; surfaced so the CLI can explain the choice. */
  targetSource: InitTargetSource;
  /** Tool configs detected on disk (drives InitData.detectedConfigs and which tools import). */
  detected: readonly string[];
  /** When true, import the detected tools and gap-fill; else write the full example scaffold. */
  doImport: boolean;
  /** Scaffold the lessons subsystem. */
  lessons: boolean;
}

/**
 * Body of the canonical root rule, or `''` when absent. Sampled around each
 * tool's import so init can report that two tools' root rules were combined
 * rather than one silently replacing the other.
 */
function readRootRuleBody(rootBase: string): string {
  const rootRule = join(rootBase, AB_ROOT_RULE);
  if (!existsSync(rootRule)) return '';
  return parseFrontmatter(readFileSync(rootRule, 'utf8')).body;
}

/** Run each detected tool's importer and collect forward-slash relative file moves. */
async function importDetectedTools(
  rootBase: string,
  scope: ConfigScope,
  toolIds: readonly string[],
): Promise<{
  imported: Array<{ from: string; to: string }>;
  importedToolCount: number;
  rootRuleMerged: boolean;
}> {
  const imported: Array<{ from: string; to: string }> = [];
  let rootRuleMerged = false;
  for (const toolId of toolIds) {
    const importerFn = IMPORTERS[toolId];
    if (!importerFn) continue;
    const rootBefore = readRootRuleBody(rootBase);
    const results = await importerFn(rootBase, scope);
    if (rootRuleBodyGrew(rootBefore, readRootRuleBody(rootBase))) rootRuleMerged = true;
    for (const r of results) {
      imported.push({
        from: relative(rootBase, r.fromPath).replaceAll('\\', '/'),
        to: r.toPath.replaceAll('\\', '/'),
      });
    }
  }
  return { imported, importedToolCount: toolIds.length, rootRuleMerged };
}

/** Apply an InitPlan and return the structured InitData. */
export async function applyInitPlan(
  projectRoot: string,
  context: ScopeContext,
  plan: InitPlan,
): Promise<InitData> {
  const configPath = join(context.configDir, CONFIG_FILENAME);

  let imported: Array<{ from: string; to: string }> = [];
  let importedToolCount = 0;
  let rootRuleMerged = false;
  let scaffoldType: 'full' | 'gap-fill';

  if (plan.doImport) {
    const res = await importDetectedTools(context.rootBase, plan.scope, plan.detected);
    imported = res.imported;
    importedToolCount = res.importedToolCount;
    rootRuleMerged = res.rootRuleMerged;
    await writeScaffoldGapFill(context.canonicalDir);
    scaffoldType = 'gap-fill';
  } else {
    await writeScaffoldFull(context.canonicalDir);
    scaffoldType = 'full';
  }

  await writeFileAtomic(configPath, buildConfig(plan.targets));

  await writeFileAtomic(join(context.configDir, LOCAL_CONFIG_FILENAME), LOCAL_TEMPLATE);

  let gitignoreUpdated = false;
  if (plan.scope === 'project') {
    gitignoreUpdated = await ensureGitignoreEntries(projectRoot, GITIGNORE_ENTRIES);
  }

  // Lessons live in the project tree and are never available in global scope —
  // enforce that invariant here at the writer, not just at the CLI flag guard.
  const lessons =
    plan.lessons && plan.scope === 'project' ? await scaffoldLessons(projectRoot) : undefined;

  return {
    scope: plan.scope,
    configFile: CONFIG_FILENAME,
    localConfigFile: LOCAL_CONFIG_FILENAME,
    detectedConfigs: [...plan.detected],
    targets: [...plan.targets],
    targetSource: plan.targetSource,
    rootRuleMerged,
    imported,
    importedToolCount,
    scaffoldType,
    gitignoreUpdated,
    lessons,
  };
}
