import { addSimpleFileMapping, addSkillLikeMapping, listFiles, rel } from '../import-map-shared.js';
import {
  ROVODEV_ROOT_FILE,
  ROVODEV_SKILLS_DIR,
  ROVODEV_SUBAGENTS_DIR,
  ROVODEV_COMMANDS_DIR,
  ROVODEV_GLOBAL_ROOT_FILE,
  ROVODEV_GLOBAL_SKILLS_DIR,
  ROVODEV_GLOBAL_SUBAGENTS_DIR,
  ROVODEV_GLOBAL_COMMANDS_DIR,
  ROVODEV_GLOBAL_MCP_FILE,
} from '../../../targets/rovodev/constants.js';
import type { TargetLayoutScope } from '../../../targets/catalog/target-descriptor.js';
import { AB_RULES } from './constants.js';
const AB_AGENTS = '.agentsmesh/agents';

const AB_COMMANDS = '.agentsmesh/commands';

export async function buildRovodevImportPaths(
  refs: Map<string, string>,
  projectRoot: string,
  scope: TargetLayoutScope = 'project',
): Promise<void> {
  if (scope === 'global') {
    refs.set(ROVODEV_GLOBAL_ROOT_FILE, `${AB_RULES}/_root.md`);
    for (const absPath of await listFiles(projectRoot, ROVODEV_GLOBAL_SKILLS_DIR)) {
      addSkillLikeMapping(refs, rel(projectRoot, absPath), ROVODEV_GLOBAL_SKILLS_DIR);
    }
    for (const absPath of await listFiles(projectRoot, ROVODEV_GLOBAL_SUBAGENTS_DIR)) {
      addSimpleFileMapping(refs, rel(projectRoot, absPath), AB_AGENTS, '.md');
    }
    for (const absPath of await listFiles(projectRoot, ROVODEV_GLOBAL_COMMANDS_DIR)) {
      addSimpleFileMapping(refs, rel(projectRoot, absPath), AB_COMMANDS, '.md');
    }
    // No project-level MCP file is documented — only `~/.rovodev/mcp_config.json` (global).
    refs.set(ROVODEV_GLOBAL_MCP_FILE, '.agentsmesh/mcp.json');
    return;
  }

  refs.set(ROVODEV_ROOT_FILE, `${AB_RULES}/_root.md`);
  for (const absPath of await listFiles(projectRoot, ROVODEV_SKILLS_DIR)) {
    addSkillLikeMapping(refs, rel(projectRoot, absPath), ROVODEV_SKILLS_DIR);
  }
  for (const absPath of await listFiles(projectRoot, ROVODEV_SUBAGENTS_DIR)) {
    addSimpleFileMapping(refs, rel(projectRoot, absPath), AB_AGENTS, '.md');
  }
  for (const absPath of await listFiles(projectRoot, ROVODEV_COMMANDS_DIR)) {
    addSimpleFileMapping(refs, rel(projectRoot, absPath), AB_COMMANDS, '.md');
  }
}
