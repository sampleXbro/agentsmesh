import { AB_AGENTS, AB_SKILLS } from '../../../core/canonical-paths.js';
import type { ImportResult } from '../../../core/types.js';
import {
  importSkillsDirectory,
  projectedAgentRecognizer,
  type SkillImportOptions,
} from './skill-import-pipeline.js';

/**
 * Import a target's skills directory, routing projected-agent skills back to
 * canonical agents. Targets whose only recognizer is the projected-agent one
 * share this instead of restating the options object.
 */
export async function importProjectedAgentSkills(
  targetName: string,
  projectRoot: string,
  skillsRelDir: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const options: SkillImportOptions = {
    projectRoot,
    destCanonicalSkillsDir: AB_SKILLS,
    targetName,
    normalize,
    results,
  };
  await importSkillsDirectory([skillsRelDir], options, [
    projectedAgentRecognizer({ canonicalAgentsDir: AB_AGENTS }),
  ]);
}
