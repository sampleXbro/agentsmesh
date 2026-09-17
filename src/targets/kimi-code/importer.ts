/**
 * Import Kimi Code CLI config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `AGENTS.md` / `.kimi-code/AGENTS.md`      — root rule plus the embedded
 *                                                 non-root rules, split back out
 *   - `~/.kimi-code/AGENTS.md` / `~/.agents/AGENTS.md` — the same, global scope
 *   - `.kimi-code/agents/`                      — native agent definitions
 *   - `.kimi-code/skills/`                      — skills, and commands projected as skills
 *   - `.kimi-code/mcp.json`                     — MCP servers
 *   - `~/.kimi-code/config.toml`                — hooks + permissions (global only)
 *
 * The repo-root `.mcp.json` Kimi Code also resolves is deliberately not read:
 * it belongs to Claude Code, and importing it here would attribute another
 * tool's servers to this target.
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { runDescriptorImport } from '../import/descriptor-import-runner.js';
import { writeMcpWithMerge } from '../import/mcp-merge.js';
import { importKimiCodeRules } from './rules-import.js';
import { importKimiCodeConfig } from './config-import.js';
import { parseKimiMcp } from './mcp-import.js';
import {
  KIMI_CODE_TARGET,
  KIMI_CODE_SKILLS_DIR,
  KIMI_CODE_GLOBAL_SKILLS_DIR,
  KIMI_CODE_MCP_FILE,
  KIMI_CODE_GLOBAL_MCP_FILE,
} from './constants.js';
import { descriptor } from './index.js';

/** Local, not a descriptor `mcpJson` spec: only this reads `transport`. */
async function importMcp(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
): Promise<void> {
  const rel = scope === 'global' ? KIMI_CODE_GLOBAL_MCP_FILE : KIMI_CODE_MCP_FILE;
  const srcPath = join(projectRoot, rel);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const servers = parseKimiMcp(content);
  if (Object.keys(servers).length === 0) return;

  await writeMcpWithMerge(projectRoot, AB_MCP, servers);
  results.push({
    fromTool: KIMI_CODE_TARGET,
    fromPath: srcPath,
    toPath: AB_MCP,
    feature: 'mcp',
  });
}

export async function importFromKimiCode(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const scope = options.scope ?? 'project';
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(KIMI_CODE_TARGET, projectRoot, scope);

  await importKimiCodeRules(projectRoot, scope, results, normalize);
  results.push(...(await runDescriptorImport(descriptor, projectRoot, scope, { normalize })));
  await importMcp(projectRoot, scope, results);

  const skillsDir = scope === 'global' ? KIMI_CODE_GLOBAL_SKILLS_DIR : KIMI_CODE_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, KIMI_CODE_TARGET, results, normalize);

  if (scope === 'global') await importKimiCodeConfig(projectRoot, results);

  return results;
}
