import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateIgnore,
  generateMcp,
  generateHooks,
  generatePermissions,
  renderWindsurfGlobalInstructions,
} from './generator.js';
import { cap } from '../catalog/capabilities.js';
import {
  WINDSURF_AGENTS_MD,
  WINDSURF_RULES_DIR,
  WINDSURF_WORKFLOWS_DIR,
  WINDSURF_SKILLS_DIR,
  WINDSURF_HOOKS_FILE,
  WINDSURF_MCP_EXAMPLE_FILE,
  CODEIUM_IGNORE,
  WINDSURF_GLOBAL_RULES,
  WINDSURF_GLOBAL_SKILLS_DIR,
  WINDSURF_GLOBAL_WORKFLOWS_DIR,
  WINDSURF_GLOBAL_HOOKS_FILE,
  WINDSURF_GLOBAL_MCP_FILE,
  WINDSURF_GLOBAL_IGNORE,
  WINDSURF_GLOBAL_AGENTS_SKILLS_DIR,
} from './constants.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import { importFromWindsurf } from './importer.js';
import { mergeWindsurfOutput } from './merge.js';
import { lintRules } from './linter.js';
import { lintCommands, lintHooks, lintMcp, lintPermissions } from './lint.js';
import { WINDSURF_HOOK_CONTEXT_EVENTS } from './hook-events.js';
import { buildWindsurfImportPaths } from '../../core/reference/import-map-builders.js';
import { shouldConvertAgentsToSkills } from '../../config/core/conversions.js';
import { projectedAgentSkillDirName } from '../projection/projected-agent-skill.js';

export const target: TargetGenerators = {
  name: 'windsurf',
  primaryRootInstructionPath: WINDSURF_AGENTS_MD,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generateIgnore,
  generatePermissions,
  importFrom: importFromWindsurf,
};

const project: TargetLayout = {
  rootInstructionPath: WINDSURF_AGENTS_MD,
  extraRuleOutputPaths(rule) {
    return rule.root ? [WINDSURF_AGENTS_MD] : [];
  },
  skillDir: WINDSURF_SKILLS_DIR,
  managedOutputs: {
    dirs: ['.windsurf/rules', '.windsurf/skills', '.windsurf/workflows'],
    files: ['AGENTS.md', '.codeiumignore', '.windsurf/mcp_config.example.json'],
    // The workspace hooks file users and enterprise fleets author; agentsmesh
    // owns only the `hooks` key. The `.example.` sidecar beside it stays fully
    // owned — Windsurf never reads it.
    coOwnedFiles: [WINDSURF_HOOKS_FILE],
  },
  paths: {
    rulePath(slug, _rule) {
      return `${WINDSURF_RULES_DIR}/${slug}.md`;
    },
    commandPath(name, _config) {
      return `${WINDSURF_WORKFLOWS_DIR}/${name}.md`;
    },
    agentPath(name, config: ValidatedConfig) {
      return shouldConvertAgentsToSkills(config, 'windsurf')
        ? `.windsurf/skills/${projectedAgentSkillDirName(name)}/SKILL.md`
        : null;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: WINDSURF_GLOBAL_RULES,
  renderPrimaryRootInstruction: renderWindsurfGlobalInstructions,
  skillDir: WINDSURF_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [
      WINDSURF_GLOBAL_SKILLS_DIR,
      WINDSURF_GLOBAL_WORKFLOWS_DIR,
      WINDSURF_GLOBAL_AGENTS_SKILLS_DIR,
    ],
    files: [WINDSURF_GLOBAL_RULES, WINDSURF_GLOBAL_IGNORE],
    // The user-level hooks file and the MCP config Cascade's UI writes.
    coOwnedFiles: [WINDSURF_GLOBAL_HOOKS_FILE, WINDSURF_GLOBAL_MCP_FILE],
  },
  rewriteGeneratedPath(path) {
    // Transform project-level paths to global ~/.codeium/windsurf/ paths
    if (path === WINDSURF_AGENTS_MD) {
      return WINDSURF_GLOBAL_RULES;
    }
    if (path.startsWith(`${WINDSURF_RULES_DIR}/`) || /\/AGENTS\.md$/.test(path)) {
      return null; // Per-rule files and directory-scoped AGENTS.md suppressed; root AGENTS.md provides primary content
    }
    if (path.startsWith(`${WINDSURF_SKILLS_DIR}/`)) {
      return path.replace(`${WINDSURF_SKILLS_DIR}/`, `${WINDSURF_GLOBAL_SKILLS_DIR}/`);
    }
    if (path.startsWith(`${WINDSURF_WORKFLOWS_DIR}/`)) {
      return path.replace(`${WINDSURF_WORKFLOWS_DIR}/`, `${WINDSURF_GLOBAL_WORKFLOWS_DIR}/`);
    }
    if (path === WINDSURF_HOOKS_FILE) {
      return WINDSURF_GLOBAL_HOOKS_FILE;
    }
    if (path === WINDSURF_MCP_EXAMPLE_FILE) {
      return WINDSURF_GLOBAL_MCP_FILE;
    }
    if (path === CODEIUM_IGNORE) {
      return WINDSURF_GLOBAL_IGNORE;
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, '.codeium/windsurf/skills', activeTargets);
  },
  paths: {
    rulePath(_slug, _rule) {
      return WINDSURF_GLOBAL_RULES; // All rules go to global_rules.md
    },
    commandPath(name, _config) {
      return `${WINDSURF_GLOBAL_WORKFLOWS_DIR}/${name}.md`;
    },
    agentPath(name, config: ValidatedConfig) {
      return shouldConvertAgentsToSkills(config, 'windsurf')
        ? `${WINDSURF_GLOBAL_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`
        : null;
    },
  },
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: cap('native', 'workflows'),
  agents: 'embedded',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'native',
  permissions: 'partial',
};

export const descriptor = {
  mergeGeneratedOutputContent: mergeWindsurfOutput,
  id: 'windsurf',
  metadata: {
    displayName: 'Windsurf',
    category: 'ide',
    officialUrl: 'https://windsurf.com',
    shortDescription: "Codeium's agentic IDE",
  },
  generators: target,
  capabilities: {
    rules: 'native',
    additionalRules: 'native',
    commands: cap('native', 'workflows'),
    agents: 'embedded',
    skills: 'native',
    mcp: 'partial',
    hooks: 'native',
    ignore: 'native',
    permissions: 'partial',
  },
  emptyImportMessage:
    'No Windsurf config found (.windsurfrules, .windsurf/rules, .windsurfignore, or .codeiumignore).',
  supportsConversion: { agents: true },
  hookContextEvents: WINDSURF_HOOK_CONTEXT_EVENTS,
  lintRules,
  lint: {
    commands: lintCommands,
    hooks: lintHooks,
    mcp: lintMcp,
    permissions: lintPermissions,
  },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      WINDSURF_GLOBAL_RULES,
      WINDSURF_GLOBAL_SKILLS_DIR,
      WINDSURF_GLOBAL_WORKFLOWS_DIR,
      WINDSURF_GLOBAL_HOOKS_FILE,
      WINDSURF_GLOBAL_MCP_FILE,
      WINDSURF_GLOBAL_IGNORE,
    ],
    layout: globalLayout,
  },
  buildImportPaths: buildWindsurfImportPaths,
  detectionPaths: ['.windsurfrules', '.windsurf'],
  nativeInstall: {
    pickPaths: [
      {
        prefix: '.windsurf/rules',
        feature: 'rules',
        strategy: { kind: 'basename', suffix: '.md' },
      },
    ],
    dialectHints: [{ frontmatterKey: 'trigger' }],
  },
  conversionDefaults: { agentsToSkills: true },
} satisfies TargetDescriptor;
