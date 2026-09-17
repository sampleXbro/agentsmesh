/**
 * Import Replit Agent config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `replit.md`          — root rule
 *   - `.agents/skills/`    — skill bundles
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { REPLIT_AGENT_TARGET, REPLIT_AGENT_SKILLS_DIR } from './constants.js';
import { descriptor } from './index.js';

export async function importFromReplitAgent(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { results, normalize } = await beginImport(descriptor, projectRoot, options);

  await importEmbeddedSkills(
    projectRoot,
    REPLIT_AGENT_SKILLS_DIR,
    REPLIT_AGENT_TARGET,
    results,
    normalize,
  );

  return results;
}
