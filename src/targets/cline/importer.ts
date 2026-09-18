/**
 * Cline target importer: `.cline/rules` (rules + workflows), `.clineignore`,
 * `.cline/mcp.json`, `.cline/skills`, `.cline/agents.yaml` into canonical
 * `.agentsmesh/`.
 *
 * Kept imperative on purpose — the MCP parser handles legacy filenames and
 * the `transportType` field, and rules/skills read from different
 * directories depending on scope (project vs global), a runtime branch not
 * declarable through `runDescriptorImport`.
 *
 * `.clineignore`, `.cline/mcp.json`, and `.cline/agents.yaml` are
 * project-only surfaces per docs.cline.bot/cli/cli-reference (no documented
 * global equivalent), so they are skipped entirely in global scope.
 */

import { AB_COMMANDS, AB_IGNORE } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { mapClineWorkflowFile } from './importer-mappers.js';
import { importClineRules } from './importer-rules.js';
import {
  CLINE_TARGET,
  CLINE_IGNORE,
  CLINE_WORKFLOWS_DIR,
  CLINE_SKILLS_DIR,
  CLINE_GLOBAL_RULES_DIR,
  CLINE_GLOBAL_SKILLS_DIR,
} from './constants.js';
import { importClineMcp } from './mcp-mapper.js';
import { importClineSkills } from './skills-adapter.js';
import { importClineHooks } from './hook-importer.js';
import { importClineAgents } from './agent-importer.js';

async function importClineIgnore(projectRoot: string, results: ImportResult[]): Promise<void> {
  const ignorePath = join(projectRoot, CLINE_IGNORE);
  const ignoreContent = await readFileSafe(ignorePath);
  if (ignoreContent === null || !ignoreContent.trim()) return;
  const lines = ignoreContent.split(/\r?\n/);
  const patterns: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith('#')) patterns.push(t);
  }
  if (patterns.length === 0) return;
  await mkdirp(join(projectRoot, '.agentsmesh'));
  const destIgnorePath = join(projectRoot, AB_IGNORE);
  await writeFileAtomic(destIgnorePath, patterns.join('\n'));
  results.push({
    fromTool: 'cline',
    fromPath: ignorePath,
    toPath: AB_IGNORE,
    feature: 'ignore',
  });
}

/**
 * Import Cline config into canonical .agentsmesh/.
 *
 * @param projectRoot - Project root directory, or `homedir()` for global scope
 * @param options - When `scope` is `global`, reads rules/skills from their
 *   global directories and skips project-only surfaces (ignore, mcp, agents)
 * @returns Import results for each imported file
 */
export async function importFromCline(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const scope = options.scope ?? 'project';
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(CLINE_TARGET, projectRoot, scope);

  await importClineRules(projectRoot, results, normalize, {
    rulesDir: scope === 'global' ? CLINE_GLOBAL_RULES_DIR : undefined,
    allowAgentsMdFallback: scope === 'project',
  });

  const skillsDir = scope === 'global' ? CLINE_GLOBAL_SKILLS_DIR : CLINE_SKILLS_DIR;
  await importClineSkills(projectRoot, results, normalize, skillsDir);

  await importClineHooks(projectRoot, results);

  // Commands (workflows) capability is unchanged by this fix and stays
  // native at both scopes — the directory path itself is not scope-aware
  // (pre-existing behavior, out of scope for this correction).
  const destCommandsDir = join(projectRoot, AB_COMMANDS);
  results.push(
    ...(await importFileDirectory({
      srcDir: join(projectRoot, CLINE_WORKFLOWS_DIR),
      destDir: destCommandsDir,
      extensions: ['.md'],
      fromTool: 'cline',
      normalize,
      mapEntry: ({ relativePath, normalizeTo }) =>
        mapClineWorkflowFile(relativePath, destCommandsDir, normalizeTo),
    })),
  );

  // Ignore, MCP, and agents are project-only surfaces (no documented global
  // equivalent) — skip them entirely in global scope.
  if (scope === 'global') return results;

  await importClineIgnore(projectRoot, results);
  await importClineMcp(projectRoot, results);
  await importClineAgents(projectRoot, results, normalize);

  return results;
}
