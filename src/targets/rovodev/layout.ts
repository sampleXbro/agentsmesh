/**
 * Rovo Dev project/global layouts (paths + managed outputs + path rewriting).
 * Split from `index.ts` to keep the descriptor file under the 200-line limit.
 */

import type { TargetLayout } from '../catalog/target-descriptor.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import {
  ROVODEV_ROOT_FILE,
  ROVODEV_SKILLS_DIR,
  ROVODEV_SUBAGENTS_DIR,
  ROVODEV_COMMANDS_DIR,
  ROVODEV_PROMPTS_FILE,
  ROVODEV_GLOBAL_ROOT_FILE,
  ROVODEV_GLOBAL_SKILLS_DIR,
  ROVODEV_GLOBAL_SUBAGENTS_DIR,
  ROVODEV_GLOBAL_COMMANDS_DIR,
  ROVODEV_GLOBAL_PROMPTS_FILE,
  ROVODEV_GLOBAL_MCP_FILE,
  ROVODEV_GLOBAL_CONFIG_FILE,
} from './constants.js';

export const project: TargetLayout = {
  rootInstructionPath: ROVODEV_ROOT_FILE,
  skillDir: ROVODEV_SKILLS_DIR,
  managedOutputs: {
    dirs: [ROVODEV_SKILLS_DIR, ROVODEV_SUBAGENTS_DIR, ROVODEV_COMMANDS_DIR],
    files: [ROVODEV_ROOT_FILE],
    // The saved-prompt manifest: the user authors prompts in it and the
    // importer reads them back, so agentsmesh owns only its marked entries.
    coOwnedFiles: [ROVODEV_PROMPTS_FILE],
  },
  paths: {
    rulePath(_slug) {
      return ROVODEV_ROOT_FILE;
    },
    commandPath(name) {
      return `${ROVODEV_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name) {
      return `${ROVODEV_SUBAGENTS_DIR}/${name}.md`;
    },
  },
};

export const globalLayout: TargetLayout = {
  rootInstructionPath: ROVODEV_GLOBAL_ROOT_FILE,
  skillDir: ROVODEV_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [ROVODEV_GLOBAL_SKILLS_DIR, ROVODEV_GLOBAL_SUBAGENTS_DIR, ROVODEV_GLOBAL_COMMANDS_DIR],
    files: [ROVODEV_GLOBAL_ROOT_FILE],
    // Rovo Dev's documented settings file; agentsmesh owns only `eventHooks`
    // and `toolPermissions` inside it. `mcp_config.json` is the documented MCP
    // config the CLI writes; agentsmesh owns the server set only.
    coOwnedFiles: [
      ROVODEV_GLOBAL_CONFIG_FILE,
      ROVODEV_GLOBAL_MCP_FILE,
      ROVODEV_GLOBAL_PROMPTS_FILE,
    ],
  },
  rewriteGeneratedPath(path) {
    if (path === ROVODEV_ROOT_FILE) return ROVODEV_GLOBAL_ROOT_FILE;
    if (path.startsWith(`${ROVODEV_SKILLS_DIR}/`)) {
      return path.replace(`${ROVODEV_SKILLS_DIR}/`, `${ROVODEV_GLOBAL_SKILLS_DIR}/`);
    }
    if (path.startsWith(`${ROVODEV_SUBAGENTS_DIR}/`)) {
      return path.replace(`${ROVODEV_SUBAGENTS_DIR}/`, `${ROVODEV_GLOBAL_SUBAGENTS_DIR}/`);
    }
    if (path === ROVODEV_PROMPTS_FILE) return ROVODEV_GLOBAL_PROMPTS_FILE;
    if (path.startsWith(`${ROVODEV_COMMANDS_DIR}/`)) {
      return path.replace(`${ROVODEV_COMMANDS_DIR}/`, `${ROVODEV_GLOBAL_COMMANDS_DIR}/`);
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, ROVODEV_GLOBAL_SKILLS_DIR, activeTargets);
  },
  paths: {
    rulePath(_slug) {
      return ROVODEV_GLOBAL_ROOT_FILE;
    },
    commandPath(name) {
      return `${ROVODEV_GLOBAL_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name) {
      return `${ROVODEV_GLOBAL_SUBAGENTS_DIR}/${name}.md`;
    },
  },
};
