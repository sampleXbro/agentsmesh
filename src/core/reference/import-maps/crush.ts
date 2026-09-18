import { AB_IGNORE, AB_MCP, AB_RULES } from '../../canonical-paths.js';
import { addSkillLikeMapping, listFiles, rel } from '../import-map-shared.js';
import {
  CRUSH_ROOT_FILE,
  CRUSH_SKILLS_DIR,
  CRUSH_CONFIG_FILE,
  CRUSH_IGNORE,
  CRUSH_GLOBAL_SKILLS_DIR,
  CRUSH_GLOBAL_ROOT_FILE,
  CRUSH_GLOBAL_IGNORE,
  CRUSH_GLOBAL_CONFIG_FILE,
} from '../../../targets/crush/constants.js';
import type { TargetLayoutScope } from '../../../targets/catalog/target-descriptor.js';

export async function buildCrushImportPaths(
  refs: Map<string, string>,
  projectRoot: string,
  scope: TargetLayoutScope = 'project',
): Promise<void> {
  if (scope === 'global') {
    refs.set(CRUSH_GLOBAL_ROOT_FILE, `${AB_RULES}/_root.md`);
    refs.set(CRUSH_GLOBAL_CONFIG_FILE, AB_MCP);
    refs.set(CRUSH_GLOBAL_IGNORE, AB_IGNORE);
    for (const absPath of await listFiles(projectRoot, CRUSH_GLOBAL_SKILLS_DIR)) {
      addSkillLikeMapping(refs, rel(projectRoot, absPath), CRUSH_GLOBAL_SKILLS_DIR);
    }
    return;
  }

  refs.set(CRUSH_ROOT_FILE, `${AB_RULES}/_root.md`);
  refs.set(CRUSH_CONFIG_FILE, AB_MCP);
  refs.set(CRUSH_IGNORE, AB_IGNORE);

  for (const absPath of await listFiles(projectRoot, CRUSH_SKILLS_DIR)) {
    addSkillLikeMapping(refs, rel(projectRoot, absPath), CRUSH_SKILLS_DIR);
  }
}
