/**
 * Load canonical slices from a path: .agentsmesh project, partial rules/commands/agents/skills trees.
 */

import { emptyCanonical } from './empty-canonical.js';
import { basename, dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { ExtendPick } from '../../config/core/schema.js';
import type {
  CanonicalAgent,
  CanonicalCommand,
  CanonicalFiles,
  CanonicalRule,
  CanonicalSkill,
} from '../../core/types.js';
import { exists } from '../../utils/filesystem/fs.js';
import {
  importAgents,
  importCommands,
  importRules,
} from '../../install/importers/entity-importers.js';
import { readEntityDirWithMappers } from '../../install/importers/target-native-commands.js';
import type { ParseFrontmatterOptions } from '../features/rules.js';
import { loadCanonicalFiles } from './loader.js';
import { isSkillPackLayout, loadSkillsAtExtendPath } from './skill-pack-load.js';

export function isCanonicalSliceEmpty(c: CanonicalFiles): boolean {
  return (
    c.rules.length === 0 &&
    c.commands.length === 0 &&
    c.agents.length === 0 &&
    c.skills.length === 0 &&
    c.mcp === null &&
    c.permissions === null &&
    c.hooks === null &&
    c.ignore.length === 0
  );
}

/**
 * If path is a single .md under rules/, commands/, or agents/, return parent dir + pick hint.
 */
export async function normalizeSlicePath(absolutePath: string): Promise<{
  sliceRoot: string;
  implicitPick?: ExtendPick;
}> {
  if (!(await exists(absolutePath))) {
    throw new Error(`Path does not exist: ${absolutePath}`);
  }
  const st = await stat(absolutePath);
  if (st.isDirectory()) {
    return { sliceRoot: absolutePath };
  }
  if (!st.isFile() || !absolutePath.toLowerCase().endsWith('.md')) {
    throw new Error(
      `Install path must be a directory or a .md file inside rules/, commands/, or agents/: ${absolutePath}`,
    );
  }
  const parent = dirname(absolutePath);
  const parentBase = basename(parent);
  const fileBase = basename(absolutePath);
  const slug = fileBase.replace(/\.md$/i, '');
  if (parentBase === 'rules') {
    return { sliceRoot: parent, implicitPick: { rules: [slug] } };
  }
  if (parentBase === 'commands') {
    return { sliceRoot: parent, implicitPick: { commands: [slug] } };
  }
  if (parentBase === 'agents') {
    return { sliceRoot: parent, implicitPick: { agents: [slug] } };
  }
  throw new Error(
    `Single-file install only supports .md files under rules/, commands/, or agents/. Got: ${absolutePath}`,
  );
}

/**
 * Install-time slice loaders. These route through the install-layer entity
 * importers (`importRules` / `importCommands` / `importAgents`) so repo
 * boilerplate files (`README.md`, `CONTRIBUTING.md`, `LICENSE*`,
 * `CODE_OF_CONDUCT.md`, ...) that frequently sit next to entity content in
 * third-party source repos are excluded from canonical discovery.
 *
 * The pure canonical loader (`loadCanonicalFiles`) used for the user's own
 * `.agentsmesh/` stays filter-free per the canonical-parser contract.
 */
/**
 * Resolve the entity dir under `sliceRoot`. The sliceRoot may itself BE the
 * entity dir (e.g. `rules/`) or may CONTAIN it (e.g. project root with a
 * `rules/` subdir). Returns null when neither shape matches.
 */
async function resolveEntityDir(
  sliceRoot: string,
  kindDirName: 'rules' | 'commands' | 'agents',
): Promise<string | null> {
  if (basename(sliceRoot) === kindDirName) return sliceRoot;
  const nested = join(sliceRoot, kindDirName);
  return (await exists(nested)) ? nested : null;
}

async function parseRulesAt(
  sliceRoot: string,
  opts: ParseFrontmatterOptions,
  enableTargetMappers: boolean,
): Promise<{ rules: CanonicalRule[]; cleanup: () => Promise<void> }> {
  const noop = async (): Promise<void> => {};
  const rulesDir = await resolveEntityDir(sliceRoot, 'rules');
  if (!rulesDir) return { rules: [], cleanup: noop };
  if (!enableTargetMappers) {
    return { rules: await importRules(rulesDir, opts), cleanup: noop };
  }
  const result = await readEntityDirWithMappers(rulesDir, 'rules', { parseOpts: opts });
  return { rules: [...result.entities], cleanup: result.cleanup };
}

async function parseCommandsAt(
  sliceRoot: string,
  opts: ParseFrontmatterOptions,
  enableTargetMappers: boolean,
): Promise<{ commands: CanonicalCommand[]; cleanup: () => Promise<void> }> {
  const noop = async (): Promise<void> => {};
  const commandsDir = await resolveEntityDir(sliceRoot, 'commands');
  if (!commandsDir) return { commands: [], cleanup: noop };
  if (!enableTargetMappers) {
    return { commands: await importCommands(commandsDir, opts), cleanup: noop };
  }
  const result = await readEntityDirWithMappers(commandsDir, 'commands', { parseOpts: opts });
  return { commands: [...result.entities], cleanup: result.cleanup };
}

async function parseAgentsAt(
  sliceRoot: string,
  opts: ParseFrontmatterOptions,
  enableTargetMappers: boolean,
): Promise<{ agents: CanonicalAgent[]; cleanup: () => Promise<void> }> {
  const noop = async (): Promise<void> => {};
  const agentsDir = await resolveEntityDir(sliceRoot, 'agents');
  if (!agentsDir) return { agents: [], cleanup: noop };
  if (!enableTargetMappers) {
    return { agents: await importAgents(agentsDir, opts), cleanup: noop };
  }
  const result = await readEntityDirWithMappers(agentsDir, 'agents', { parseOpts: opts });
  return { agents: [...result.entities], cleanup: result.cleanup };
}

/** Skill pack at slice root or nested `skills/` (common in upstream repos). */
async function loadSkillsForPartialSlice(
  sliceRoot: string,
  opts: ParseFrontmatterOptions,
): Promise<CanonicalSkill[]> {
  if (await isSkillPackLayout(sliceRoot)) {
    return loadSkillsAtExtendPath(sliceRoot, opts);
  }
  const nestedSkills = join(sliceRoot, 'skills');
  if (await isSkillPackLayout(nestedSkills)) {
    return loadSkillsAtExtendPath(nestedSkills, opts);
  }
  return [];
}

export interface LoadCanonicalSliceOptions extends ParseFrontmatterOptions {
  /**
   * Run every registered target's non-`.md` importer mapper for rules,
   * commands, and agents alongside the canonical `.md` reader. Install-path
   * callers set this so root-level `commands/*.toml`, `rules/*.mdc`, etc.
   * install without flags. Extends-path callers leave it off to preserve
   * historical `.md`-only behavior and avoid the tmpdir staging lifecycle
   * (extends content needs to outlive its load).
   */
  enableTargetEntityMappers?: boolean;
}

/**
 * Load whatever canonical resources exist at sliceRoot (directory). Returns
 * a cleanup callback when target-mapper staging directories were created;
 * a no-op otherwise. Callers MUST await `cleanup()` after they are done
 * reading from `commands[].source` (e.g. once pack materialization has
 * copied each staged file into the pack tree).
 */
export async function loadCanonicalSliceAtPath(
  sliceRoot: string,
  opts: LoadCanonicalSliceOptions = {},
): Promise<{ canonical: CanonicalFiles; cleanup: () => Promise<void> }> {
  const noop = async (): Promise<void> => {};
  const ab = join(sliceRoot, '.agentsmesh');
  if (await exists(ab)) {
    return { canonical: await loadCanonicalFiles(sliceRoot, opts), cleanup: noop };
  }

  const enableMappers = opts.enableTargetEntityMappers ?? false;
  const partial = emptyCanonical();
  const rulesResult = await parseRulesAt(sliceRoot, opts, enableMappers);
  partial.rules = rulesResult.rules;
  const commandsResult = await parseCommandsAt(sliceRoot, opts, enableMappers);
  partial.commands = commandsResult.commands;
  const agentsResult = await parseAgentsAt(sliceRoot, opts, enableMappers);
  partial.agents = agentsResult.agents;

  partial.skills = await loadSkillsForPartialSlice(sliceRoot, opts);

  // Best-effort: never let one staging-dir failure strand the others.
  const mergedCleanup = async (): Promise<void> => {
    await Promise.allSettled([
      rulesResult.cleanup(),
      commandsResult.cleanup(),
      agentsResult.cleanup(),
    ]);
  };

  if (isCanonicalSliceEmpty(partial)) {
    await mergedCleanup();
    throw new Error(
      `No installable resources at ${sliceRoot}. ` +
        'Expected .agentsmesh/, or rules/, commands/, agents/, or Anthropic-style skills (SKILL.md). ' +
        'Hint: pass --as commands|agents|rules|skills to force a kind for flat markdown directories.',
    );
  }

  return { canonical: partial, cleanup: mergedCleanup };
}
