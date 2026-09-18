/**
 * Codex CLI skills import adapter - handles command skills, agent projections, and regular
 * skills via the shared orchestrator. Tries the primary skills dir, then a fallback dir.
 */

import { AB_AGENTS, AB_COMMANDS, AB_SKILLS } from '../../core/canonical-paths.js';
import type { ImportResult } from '../../core/types.js';
import {
  commandSkillRecognizer,
  importSkillsDirectory,
  projectedAgentRecognizer,
  type SkillImportOptions,
} from '../import/shared/skill-import-pipeline.js';
import { CODEX_TARGET, CODEX_SKILLS_DIR, CODEX_SKILLS_FALLBACK_DIR } from './constants.js';

export async function importSkills(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const options: SkillImportOptions = {
    projectRoot,
    destCanonicalSkillsDir: AB_SKILLS,
    targetName: CODEX_TARGET,
    normalize,
    results,
  };

  await importSkillsDirectory([CODEX_SKILLS_DIR, CODEX_SKILLS_FALLBACK_DIR], options, [
    commandSkillRecognizer({ canonicalCommandsDir: AB_COMMANDS }),
    projectedAgentRecognizer({ canonicalAgentsDir: AB_AGENTS }),
  ]);
}
