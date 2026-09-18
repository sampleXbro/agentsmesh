/**
 * Import Rovo Dev config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `AGENTS.md`               — root rule
 *   - `.rovodev/skills/`        — skill bundles
 *   - `.rovodev/prompts.yml`    — saved prompts manifest (custom commands)
 *   - `~/.rovodev/mcp_config.json` — MCP servers (global scope only)
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { importCommands } from './prompts.js';
import {
  ROVODEV_TARGET,
  ROVODEV_SKILLS_DIR,
  ROVODEV_GLOBAL_SKILLS_DIR,
  ROVODEV_PROMPTS_FILE,
  ROVODEV_GLOBAL_PROMPTS_FILE,
} from './constants.js';
import { descriptor } from './index.js';

export async function importFromRovodev(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? ROVODEV_GLOBAL_SKILLS_DIR : ROVODEV_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, ROVODEV_TARGET, results, normalize);

  const promptsPath = scope === 'global' ? ROVODEV_GLOBAL_PROMPTS_FILE : ROVODEV_PROMPTS_FILE;
  await importCommands(projectRoot, promptsPath, results, normalize);

  return results;
}
