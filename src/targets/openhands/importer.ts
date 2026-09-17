/**
 * Import OpenHands config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `AGENTS.md` / `~/.agents/skills/_root.md`        — root rule
 *   - `.agents/skills/<slug>.md`                        — path-scoped rules
 *   - `.agents/skills/<name>/`                          — skill bundles, plus the
 *     command/agent skill projections other `.agents/skills/` targets write
 *   - `.agents/agents/<name>.md`                        — subagents
 *   - `.agents/plugins/agentsmesh/commands/<name>.md`   — commands
 *   - `.agents/plugins/agentsmesh/.mcp.json`            — MCP servers
 *   - `.openhands/hooks.json`                           — lifecycle hooks
 */

import { AB_HOOKS } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { runDescriptorImport } from '../import/descriptor-import-runner.js';
import { parseOpenhandsHooks } from './hooks-import.js';
import { OPENHANDS_TARGET, OPENHANDS_SKILLS_DIR, OPENHANDS_HOOKS_FILE } from './constants.js';
import { descriptor } from './index.js';

export async function importFromOpenhands(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const scope = options.scope ?? 'project';
  const normalize = await createImportReferenceNormalizer(OPENHANDS_TARGET, projectRoot, scope);

  const results = await runDescriptorImport(descriptor, projectRoot, scope, { normalize });
  await importEmbeddedSkills(
    projectRoot,
    OPENHANDS_SKILLS_DIR,
    OPENHANDS_TARGET,
    results,
    normalize,
  );
  await importOpenhandsHooks(projectRoot, results);
  return results;
}

/**
 * `.openhands/hooks.json` accepts a bare event map AND the `{ "hooks": … }`
 * wrapper, in either casing, with the handler `type` optional — wider than any
 * shared helper parses, so it gets its own reader (hooks-import.ts).
 */
async function importOpenhandsHooks(projectRoot: string, results: ImportResult[]): Promise<void> {
  const srcPath = join(projectRoot, OPENHANDS_HOOKS_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  const hooks = parseOpenhandsHooks(content);
  if (hooks === null) return;

  const destPath = join(projectRoot, AB_HOOKS);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, stringifyYaml(hooks));
  results.push({
    fromTool: OPENHANDS_TARGET,
    fromPath: srcPath,
    toPath: AB_HOOKS,
    feature: 'hooks',
  });
}
