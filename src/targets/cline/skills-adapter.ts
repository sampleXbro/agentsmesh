/**
 * Cline skills import adapter — projected agent skills and regular skills via the
 * shared orchestrator.
 */

import type { ImportResult } from '../../core/types.js';
import { importProjectedAgentSkills } from '../import/shared/projected-agent-skills-adapter.js';
import { CLINE_SKILLS_DIR } from './constants.js';

export async function importClineSkills(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
  skillsRelDir: string = CLINE_SKILLS_DIR,
): Promise<void> {
  await importProjectedAgentSkills('cline', projectRoot, skillsRelDir, results, normalize);
}
