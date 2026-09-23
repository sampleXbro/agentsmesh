import { AB_AGENTS, AB_COMMANDS } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generatePermissions,
  generateHooks,
  generateIgnore,
} from './generator.js';
import {
  CURSOR_COMPAT_AGENTS,
  CURSOR_AGENTS_DIR,
  CURSOR_COMMANDS_DIR,
  CURSOR_DOT_CURSOR_AGENTS,
  CURSOR_GENERAL_RULE,
  CURSOR_GLOBAL_USER_RULES,
  CURSOR_HOOKS,
  CURSOR_IGNORE,
  CURSOR_MCP,
  CURSOR_RULES_DIR,
  CURSOR_SETTINGS,
  CURSOR_SKILLS_DIR,
  CURSOR_GLOBAL_CLI_CONFIG,
  CURSOR_CLI_JSON,
} from './constants.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import { importFromCursor } from './importer.js';
import { mergeCursorOutput } from './merge.js';
import { cursorAgentMapper, cursorCommandMapper } from './import-mappers.js';
import { lintRules } from './linter.js';
import { buildCursorImportPaths } from '../../core/reference/import-map-builders.js';
import { lintCommands, lintMcp, lintPermissions, lintHooks } from './lint.js';
import { CURSOR_HOOK_CONTEXT_EVENTS } from './hook-format.js';

export const target: TargetGenerators = {
  name: 'cursor',
  primaryRootInstructionPath: CURSOR_GENERAL_RULE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generatePermissions,
  generateHooks,
  generateIgnore,
  importFrom: importFromCursor,
};

const project: TargetLayout = {
  rootInstructionPath: CURSOR_GENERAL_RULE,
  outputFamilies: [
    {
      id: 'root-mirrors',
      kind: 'additional',
      explicitPaths: [CURSOR_COMPAT_AGENTS, CURSOR_DOT_CURSOR_AGENTS],
    },
  ],
  skillDir: '.cursor/skills',
  managedOutputs: {
    dirs: ['.cursor/agents', '.cursor/commands', '.cursor/rules', '.cursor/skills'],
    files: ['.cursorignore', 'AGENTS.md'],
    // All three are Cursor's own files: the MCP panel writes mcp.json, hooks
    // are hand-authored or plugin-installed, and cli.json is the Agent CLI
    // config (version/editor/network live beside `permissions`). agentsmesh
    // owns only its keys inside each (see merge.ts).
    coOwnedFiles: [CURSOR_HOOKS, CURSOR_MCP, CURSOR_CLI_JSON],
  },
  paths: {
    rulePath(slug, _rule) {
      return `.cursor/rules/${slug}.mdc`;
    },
    commandPath(name, _config) {
      return `.cursor/commands/${name}.md`;
    },
    agentPath(name, _config) {
      return `.cursor/agents/${name}.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: CURSOR_GENERAL_RULE,
  outputFamilies: [
    {
      id: 'root-mirrors',
      kind: 'additional',
      explicitPaths: [CURSOR_COMPAT_AGENTS, CURSOR_DOT_CURSOR_AGENTS],
    },
  ],
  skillDir: CURSOR_SKILLS_DIR,
  managedOutputs: {
    dirs: [CURSOR_RULES_DIR, CURSOR_COMMANDS_DIR, CURSOR_AGENTS_DIR, CURSOR_SKILLS_DIR],
    files: [CURSOR_GENERAL_RULE, CURSOR_DOT_CURSOR_AGENTS, CURSOR_IGNORE, CURSOR_GLOBAL_USER_RULES],
    coOwnedFiles: [CURSOR_MCP, CURSOR_HOOKS, CURSOR_GLOBAL_CLI_CONFIG],
  },
  rewriteGeneratedPath(path) {
    if (path === CURSOR_COMPAT_AGENTS) return null;
    if (path === CURSOR_DOT_CURSOR_AGENTS) return path;
    if (path === CURSOR_GENERAL_RULE || path.startsWith(`${CURSOR_RULES_DIR}/`)) return path;
    if (path.startsWith(`${CURSOR_COMMANDS_DIR}/`)) return path;
    if (path.startsWith(`${CURSOR_AGENTS_DIR}/`)) return path;
    if (path.startsWith(`${CURSOR_SKILLS_DIR}/`)) return path;
    if (path === CURSOR_MCP) return path;
    if (path === CURSOR_GLOBAL_CLI_CONFIG) return path;
    if (path === CURSOR_HOOKS || path === CURSOR_IGNORE) return path;
    if (path === CURSOR_SETTINGS) return null;
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, CURSOR_SKILLS_DIR, activeTargets);
  },
  paths: {
    rulePath(slug, _rule) {
      return `${CURSOR_RULES_DIR}/${slug}.mdc`;
    },
    commandPath(name, _config) {
      return `${CURSOR_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name, _config) {
      return `${CURSOR_AGENTS_DIR}/${name}.md`;
    },
  },
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'native',
  commands: 'native',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'native',
  permissions: 'native',
};

export const descriptor = {
  mergeGeneratedOutputContent: mergeCursorOutput,
  id: 'cursor',
  minimalInitDefault: true,
  metadata: {
    displayName: 'Cursor',
    category: 'ide',
    officialUrl: 'https://cursor.com',
    shortDescription: 'AI-first code editor',
  },
  generators: target,
  capabilities: {
    rules: 'native',
    additionalRules: 'native',
    commands: 'native',
    agents: 'native',
    skills: 'native',
    mcp: 'native',
    hooks: 'native',
    ignore: 'native',
    permissions: 'native',
  },
  emptyImportMessage:
    'No Cursor config found (AGENTS.md or .cursor/rules/*.mdc; with --global: ~/.cursor/{rules/*.mdc,AGENTS.md,mcp.json,hooks.json,cursorignore,skills/,agents/,commands/} and legacy ~/.agentsmesh-exports/cursor/user-rules.md).',
  hookContextEvents: CURSOR_HOOK_CONTEXT_EVENTS,
  lintRules,
  lint: {
    commands: lintCommands,
    mcp: lintMcp,
    permissions: lintPermissions,
    hooks: lintHooks,
  },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      CURSOR_GENERAL_RULE,
      CURSOR_DOT_CURSOR_AGENTS,
      CURSOR_MCP,
      CURSOR_HOOKS,
      CURSOR_IGNORE,
      CURSOR_SKILLS_DIR,
      CURSOR_AGENTS_DIR,
      CURSOR_COMMANDS_DIR,
      CURSOR_GLOBAL_USER_RULES,
    ],
    layout: globalLayout,
  },
  importer: {
    // Project-only declarable features. Rules/mcp/skills/settings/ignore stay
    // imperative (see importer.ts). Ignore in particular merges
    // `.cursorignore` + `.cursorindexingignore` into a deduped list, which
    // the runner's `flatFile` mode does not model. Global scope dispatches to
    // a separate code path.
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: { project: [CURSOR_COMMANDS_DIR] },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      map: cursorCommandMapper,
    },
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: { project: [CURSOR_AGENTS_DIR] },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      map: cursorAgentMapper,
    },
  },
  buildImportPaths: buildCursorImportPaths,
  detectionPaths: ['.cursor/rules', '.cursor/mcp.json'],
  nativeInstall: {
    pickPaths: [
      { prefix: '.cursor/rules', feature: 'rules', strategy: { kind: 'basename', suffix: '.mdc' } },
      {
        prefix: '.cursor/commands',
        feature: 'commands',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      {
        prefix: '.cursor/agents',
        feature: 'agents',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      { prefix: '.cursor/skills', feature: 'skills', strategy: { kind: 'skillDir' } },
    ],
    dialectHints: [{ frontmatterKey: 'alwaysApply' }],
  },
  preservesManualActivation: true,
} satisfies TargetDescriptor;
