/**
 * Import Cursor global artifacts under `$HOME`:
 * - `~/.cursor/rules/*.mdc` (same semantics as project import)
 * - legacy `~/.agentsmesh-exports/cursor/user-rules.md`
 * - `~/.cursor/AGENTS.md` aggregate fallback when no structured root exists
 * - `~/.cursor/mcp.json`, skills, agents, commands, hooks.json, cursorignore
 */

import type { ImportResult } from '../../core/types.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { CURSOR_SKILLS_DIR } from './constants.js';
import { importSkills } from './skills-adapter.js';
import { importSettings } from './settings-helpers.js';
import {
  CURSOR_TARGET,
  hasGlobalCursorArtifacts,
  importGlobalCursorRulesFromDir,
  importGlobalUserRules,
  importGlobalDotCursorAgents,
  importGlobalMcp,
  importGlobalAgents,
  importGlobalCommands,
} from './import-global-exports-helpers.js';

export async function importFromCursorGlobalExports(projectRoot: string): Promise<ImportResult[]> {
  if (!(await hasGlobalCursorArtifacts(projectRoot))) return [];
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(CURSOR_TARGET, projectRoot, 'global');
  let rootWritten = await importGlobalCursorRulesFromDir(projectRoot, results, normalize);
  if (!rootWritten) rootWritten = await importGlobalUserRules(projectRoot, results, normalize);
  if (!rootWritten) await importGlobalDotCursorAgents(projectRoot, results, normalize);
  await importGlobalMcp(projectRoot, results);
  await importSkills(projectRoot, results, normalize, CURSOR_SKILLS_DIR);
  await importGlobalAgents(projectRoot, results, normalize);
  await importGlobalCommands(projectRoot, results, normalize);
  await importSettings(projectRoot, results, 'global');
  return results;
}
