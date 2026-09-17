/**
 * Import Pi Coding Agent config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `AGENTS.md`      -- root rule
 *   - `.pi/prompts/`   -- native prompt templates -> canonical commands
 *   - `.pi/skills/`    -- skill bundles
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { importPiAgentPermissions } from './permissions-import.js';
import { PI_AGENT_TARGET, PI_AGENT_SKILLS_DIR, PI_AGENT_GLOBAL_SKILLS_DIR } from './constants.js';
import { descriptor } from './index.js';

export async function importFromPiAgent(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? PI_AGENT_GLOBAL_SKILLS_DIR : PI_AGENT_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, PI_AGENT_TARGET, results, normalize);
  await importPiAgentPermissions(projectRoot, scope, results);

  return results;
}
