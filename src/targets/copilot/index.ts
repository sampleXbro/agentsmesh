import { basename } from 'node:path';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateHooks,
  generateMcp,
  renderCopilotGlobalInstructions,
} from './generator.js';
import {
  COPILOT_INSTRUCTIONS,
  COPILOT_INSTRUCTIONS_DIR,
  COPILOT_AGENTS_DIR,
  COPILOT_PROMPTS_DIR,
  COPILOT_SKILLS_DIR,
  COPILOT_HOOKS_DIR,
  COPILOT_MCP_JSON,
  COPILOT_GLOBAL_INSTRUCTIONS,
  COPILOT_GLOBAL_AGENTS_DIR,
  COPILOT_GLOBAL_SKILLS_DIR,
  COPILOT_GLOBAL_AGENTS_SKILLS_DIR,
  COPILOT_GLOBAL_AGENTS_MD,
  COPILOT_GLOBAL_CLAUDE_SKILLS_DIR,
  COPILOT_GLOBAL_MCP,
  COPILOT_GLOBAL_HOOKS_DIR,
} from './constants.js';
import { importFromCopilot } from './importer.js';
import { inferCopilotPickFromPath } from '../../install/native/native-path-pick-infer-copilot.js';
import { lintRules } from './linter.js';
import { buildCopilotImportPaths } from '../../core/reference/import-map-builders.js';
import { commandPromptPath } from './command-prompt.js';
import { lintCommands, lintHooks, lintPermissions } from './lint.js';
import { addHookScriptAssets } from './hook-assets.js';
import { generateCopilotGlobalExtras } from './scope-extras.js';
import { copilotImporterSpec } from './importer-spec.js';
import { projectCapabilities, globalCapabilities } from './capabilities.js';
import { mergeCopilotMcpJson } from './mcp-merge.js';

export const target: TargetGenerators = {
  name: 'copilot',
  primaryRootInstructionPath: COPILOT_INSTRUCTIONS,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateHooks,
  generateMcp,
  importFrom: importFromCopilot,
};

const project: TargetLayout = {
  rootInstructionPath: COPILOT_INSTRUCTIONS,
  outputFamilies: [{ id: 'instructions', kind: 'additional', pathPrefix: '.github/instructions/' }],
  extraRuleOutputPaths(rule) {
    if (rule.root || rule.globs.length === 0) return [];
    const slug = basename(rule.source, '.md');
    return [`${COPILOT_INSTRUCTIONS_DIR}/${slug}.instructions.md`];
  },
  skillDir: '.github/skills',
  managedOutputs: {
    dirs: [
      '.github/agents',
      '.github/instructions',
      '.github/prompts',
      '.github/skills',
      '.github/hooks/scripts',
    ],
    files: ['.github/copilot-instructions.md', '.github/hooks/agentsmesh.json'],
    // VS Code writes `.vscode/mcp.json` itself and the user's secret-prompt
    // `inputs` live there; agentsmesh owns only `servers`.
    coOwnedFiles: [COPILOT_MCP_JSON],
  },
  paths: {
    rulePath(slug, _rule) {
      return `${COPILOT_INSTRUCTIONS_DIR}/${slug}.instructions.md`;
    },
    commandPath(name, _config) {
      return commandPromptPath(name);
    },
    agentPath(name, _config) {
      return `${COPILOT_AGENTS_DIR}/${name}.agent.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: COPILOT_GLOBAL_INSTRUCTIONS,
  renderPrimaryRootInstruction: renderCopilotGlobalInstructions,
  outputFamilies: [
    { id: 'compat-agents', kind: 'additional', explicitPaths: [COPILOT_GLOBAL_AGENTS_MD] },
  ],
  skillDir: COPILOT_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [
      COPILOT_GLOBAL_AGENTS_DIR,
      COPILOT_GLOBAL_SKILLS_DIR,
      COPILOT_GLOBAL_AGENTS_SKILLS_DIR,
      COPILOT_GLOBAL_CLAUDE_SKILLS_DIR,
      COPILOT_GLOBAL_HOOKS_DIR,
    ],
    files: [COPILOT_GLOBAL_INSTRUCTIONS, COPILOT_GLOBAL_AGENTS_MD],
    // `copilot mcp add` writes this file; agentsmesh owns only the server set.
    coOwnedFiles: [COPILOT_GLOBAL_MCP],
  },
  rewriteGeneratedPath(path) {
    // Transform project-level .github/ paths to global ~/.copilot/ paths
    if (path === COPILOT_INSTRUCTIONS) {
      return COPILOT_GLOBAL_INSTRUCTIONS;
    }
    if (path.startsWith(`${COPILOT_INSTRUCTIONS_DIR}/`)) {
      // Glob-scoped instructions aggregate into the single root instructions file in global mode
      return COPILOT_GLOBAL_INSTRUCTIONS;
    }
    // Copilot CLI has no prompt-file/slash-command mechanism (no `prompts/`
    // entry in the official ~/.copilot config-dir reference; github/copilot-cli#618
    // confirms prompt files are not planned) — commands are not projected in global mode.
    if (path.startsWith(`${COPILOT_PROMPTS_DIR}/`)) {
      return null;
    }
    if (path.startsWith(`${COPILOT_AGENTS_DIR}/`)) {
      return path.replace(`${COPILOT_AGENTS_DIR}/`, `${COPILOT_GLOBAL_AGENTS_DIR}/`);
    }
    if (path.startsWith(`${COPILOT_SKILLS_DIR}/`)) {
      return path.replace(`${COPILOT_SKILLS_DIR}/`, `${COPILOT_GLOBAL_SKILLS_DIR}/`);
    }
    // Hooks and MCP are emitted for global scope via globalSupport.scopeExtras
    // (different schema/key than project scope), not through this plain
    // project-shaped generator path — skip here so the project-shaped output
    // doesn't leak into global mode at the wrong path.
    if (path.startsWith(`${COPILOT_HOOKS_DIR}/`)) {
      return null;
    }
    if (path === COPILOT_MCP_JSON) {
      return null;
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    // Mirror ~/.copilot/skills/ to ~/.agents/skills/ and ~/.claude/skills/ unless codex-cli owns it
    if (path.startsWith(`${COPILOT_GLOBAL_SKILLS_DIR}/`) && !activeTargets.includes('codex-cli')) {
      const rel = path.slice(COPILOT_GLOBAL_SKILLS_DIR.length + 1);
      return [`.agents/skills/${rel}`, `${COPILOT_GLOBAL_CLAUDE_SKILLS_DIR}/${rel}`];
    }
    return null;
  },
  paths: {
    rulePath(_slug, _rule) {
      // Global mode uses single instructions file, not per-rule files
      return COPILOT_GLOBAL_INSTRUCTIONS;
    },
    commandPath(_name, _config) {
      // No global commands surface (see globalCapabilities.commands = 'none').
      return null;
    },
    agentPath(name, _config) {
      return `${COPILOT_GLOBAL_AGENTS_DIR}/${name}.agent.md`;
    },
  },
};

export const descriptor = {
  id: 'copilot',
  minimalInitDefault: true,
  metadata: {
    displayName: 'GitHub Copilot',
    category: 'ide',
    officialUrl: 'https://github.com/features/copilot',
    shortDescription: "GitHub's AI pair programmer",
  },
  generators: target,
  capabilities: projectCapabilities,
  emptyImportMessage:
    'No Copilot config found (.github/copilot-instructions.md, .github/copilot or .github/instructions, .github/prompts, .github/skills, .github/agents, or .github/hooks).',
  lintRules,
  lint: {
    commands: lintCommands,
    hooks: lintHooks,
    permissions: lintPermissions,
  },
  postProcessHookOutputs: async (projectRoot, canonical, outputs) =>
    addHookScriptAssets(projectRoot, canonical, [...outputs]),
  mergeGeneratedOutputContent: mergeCopilotMcpJson,
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      COPILOT_GLOBAL_INSTRUCTIONS,
      COPILOT_GLOBAL_AGENTS_MD,
      COPILOT_GLOBAL_AGENTS_DIR,
      COPILOT_GLOBAL_SKILLS_DIR,
      COPILOT_GLOBAL_AGENTS_SKILLS_DIR,
      COPILOT_GLOBAL_MCP,
      COPILOT_GLOBAL_HOOKS_DIR,
    ],
    layout: globalLayout,
    scopeExtras: generateCopilotGlobalExtras,
  },
  importer: copilotImporterSpec,
  buildImportPaths: buildCopilotImportPaths,
  detectionPaths: [
    '.github/copilot-instructions.md',
    '.github/copilot',
    '.github/instructions',
    '.github/prompts',
    '.github/skills',
    '.github/agents',
    '.github/hooks',
  ],
  nativeInstall: { inferPick: inferCopilotPickFromPath },
} satisfies TargetDescriptor;
