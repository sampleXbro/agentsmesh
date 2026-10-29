/**
 * Claude Code target importer.
 *
 * Declarative parts (root rule fallback, non-root rules, commands, agents,
 * MCP, ignore) live in `descriptor.importer` and run through the shared
 * `runDescriptorImport` orchestrator. Imperative parts that the runner does
 * not yet model — embedded skill trees, the standalone `.claude/hooks.json`
 * format, and `.claude/settings.json` (which can carry mcpServers, permissions,
 * AND hooks all at once with double-import guards) — stay here.
 */

import type { ImportResult } from '../../core/types.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { runDescriptorImport } from '../import/descriptor-import-runner.js';
import { importClaudeHooksJson, importSettings } from './settings-helpers.js';
import { importClaudeSkills } from './importer-skills.js';
import { importClaudeDenyIgnore } from './ignore.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { descriptor } from './index.js';

export async function importFromClaudeCode(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const scope = options.scope ?? 'project';
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer('claude-code', projectRoot, scope);
  results.push(...(await runDescriptorImport(descriptor, projectRoot, scope, { normalize })));
  await importClaudeSkills(projectRoot, results, normalize);
  await importClaudeHooksJson(projectRoot, results);
  await importSettings(projectRoot, results);
  await importClaudeDenyIgnore(projectRoot, results);
  return results;
}
