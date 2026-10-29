/**
 * Kilo Code project and global layout definitions, plus capability objects.
 */

import type { TargetCapabilities } from '../catalog/target.interface.js';
import type { TargetLayout } from '../catalog/target-descriptor.js';
import {
  KILO_CODE_ROOT_RULE,
  KILO_CODE_RULES_DIR,
  KILO_CODE_COMMANDS_DIR,
  KILO_CODE_AGENTS_DIR,
  KILO_CODE_SKILLS_DIR,
  KILO_CODE_MCP_FILE,
  KILO_CODE_IGNORE,
  KILO_CODE_GLOBAL_AGENTS_MD,
  KILO_CODE_GLOBAL_RULES_DIR,
  KILO_CODE_GLOBAL_COMMANDS_DIR,
  KILO_CODE_GLOBAL_AGENTS_DIR,
  KILO_CODE_GLOBAL_SKILLS_DIR,
  KILO_CODE_GLOBAL_AGENTS_SKILLS_DIR,
  KILO_CONFIG_FILE,
  KILO_GLOBAL_CONFIG_FILE,
} from './constants.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';

export const project: TargetLayout = {
  rootInstructionPath: KILO_CODE_ROOT_RULE,
  skillDir: KILO_CODE_SKILLS_DIR,
  managedOutputs: {
    dirs: [KILO_CODE_RULES_DIR, KILO_CODE_COMMANDS_DIR, KILO_CODE_AGENTS_DIR, KILO_CODE_SKILLS_DIR],
    files: [KILO_CODE_ROOT_RULE, KILO_CODE_IGNORE],
    // Kilo's documented settings file, comments and custom keys included;
    // agentsmesh overlays only the keys it manages (see merge.ts). `.kilo/mcp.json`
    // is Kilo's own MCP store (Roo lineage: `alwaysAllow`, `disabled`, `timeout`
    // are written back by the extension), so agentsmesh owns the server set only.
    coOwnedFiles: [KILO_CONFIG_FILE, KILO_CODE_MCP_FILE],
  },
  paths: {
    rulePath(slug, _rule) {
      return `${KILO_CODE_RULES_DIR}/${slug}.md`;
    },
    commandPath(name, _config) {
      return `${KILO_CODE_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name, _config) {
      return `${KILO_CODE_AGENTS_DIR}/${name}.md`;
    },
  },
};

export const globalLayout: TargetLayout = {
  rootInstructionPath: KILO_CODE_GLOBAL_AGENTS_MD,
  skillDir: KILO_CODE_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [
      KILO_CODE_GLOBAL_RULES_DIR,
      KILO_CODE_GLOBAL_COMMANDS_DIR,
      KILO_CODE_GLOBAL_AGENTS_DIR,
      KILO_CODE_GLOBAL_SKILLS_DIR,
      KILO_CODE_GLOBAL_AGENTS_SKILLS_DIR,
    ],
    files: [KILO_CODE_GLOBAL_AGENTS_MD],
    coOwnedFiles: [KILO_GLOBAL_CONFIG_FILE],
  },
  rewriteGeneratedPath(path) {
    if (path === KILO_CODE_ROOT_RULE) return KILO_CODE_GLOBAL_AGENTS_MD;
    if (path === KILO_CONFIG_FILE) return KILO_GLOBAL_CONFIG_FILE;
    // MCP folds into the `mcp` key of kilo.jsonc at global scope (see
    // global-settings.ts) instead of a standalone `.kilo/mcp.json` file.
    if (path === KILO_CODE_MCP_FILE) return null;
    // No documented global `.kilocodeignore` equivalent — ignore is 'none'
    // at global scope (kilo.ai/docs/customize/context/kilocodeignore
    // describes it as workspace-root-only).
    if (path === KILO_CODE_IGNORE) return null;
    if (path.startsWith(`${KILO_CODE_RULES_DIR}/`)) {
      return path.replace(`${KILO_CODE_RULES_DIR}/`, `${KILO_CODE_GLOBAL_RULES_DIR}/`);
    }
    if (path.startsWith(`${KILO_CODE_COMMANDS_DIR}/`)) {
      return path.replace(`${KILO_CODE_COMMANDS_DIR}/`, `${KILO_CODE_GLOBAL_COMMANDS_DIR}/`);
    }
    if (path.startsWith(`${KILO_CODE_AGENTS_DIR}/`)) {
      return path.replace(`${KILO_CODE_AGENTS_DIR}/`, `${KILO_CODE_GLOBAL_AGENTS_DIR}/`);
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, KILO_CODE_GLOBAL_SKILLS_DIR, activeTargets);
  },
  paths: {
    rulePath(slug, _rule) {
      return `${KILO_CODE_GLOBAL_RULES_DIR}/${slug}.md`;
    },
    commandPath(name, _config) {
      return `${KILO_CODE_GLOBAL_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name, _config) {
      return `${KILO_CODE_GLOBAL_AGENTS_DIR}/${name}.md`;
    },
  },
};

export const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'native',
  commands: 'native',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'none'
  ignore: 'native',
  permissions: 'native',
};

export const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'native',
  commands: 'native',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'none'
  ignore: 'none',
  permissions: 'native',
};
