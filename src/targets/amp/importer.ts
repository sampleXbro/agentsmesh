/**
 * Import Amp config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `AGENTS.md`          — root rule
 *   - `.agents/skills/`    — skill bundles
 *   - `.amp/settings.json` — MCP servers (amp.mcpServers key)
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { importAmpMcp } from './mcp-import.js';
import {
  AMP_TARGET,
  AMP_SKILLS_DIR,
  AMP_MCP_FILE,
  AMP_GLOBAL_SKILLS_DIR,
  AMP_GLOBAL_MCP_FILE,
} from './constants.js';
import { descriptor } from './index.js';

export async function importFromAmp(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? AMP_GLOBAL_SKILLS_DIR : AMP_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, AMP_TARGET, results, normalize);

  const mcpFile = scope === 'global' ? AMP_GLOBAL_MCP_FILE : AMP_MCP_FILE;
  await importAmpMcp(projectRoot, mcpFile, results);

  return results;
}
