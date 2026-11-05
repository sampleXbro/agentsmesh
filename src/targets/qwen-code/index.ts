/**
 * Qwen Code target descriptor.
 * Config: `.qwen/` (project), `~/.qwen/` (global).
 * settings.json holds MCP, hooks, and permissions (merged via mergeGeneratedOutputContent).
 */

import { isRecord } from '../../utils/types/guards.js';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generateHooks,
  generatePermissions,
} from './generator.js';
import { importFromQwenCode } from './importer.js';
import { lintRules } from './linter.js';
import { lintCommands } from './lint.js';
import { project, globalLayout, capabilities, globalCapabilities } from './layout.js';
import { buildQwenCodeImportPaths } from '../../core/reference/import-map-builders.js';
import { qwenCodeImporterSpec } from './importer-spec.js';
import { preservedUnparsableBase } from '../../core/generate/json-owned-keys.js';
import {
  QWEN_CODE_TARGET,
  QWEN_ROOT,
  QWEN_SETTINGS,
  QWEN_GLOBAL_ROOT,
  QWEN_GLOBAL_SETTINGS,
  QWEN_GLOBAL_RULES_DIR,
  QWEN_GLOBAL_COMMANDS_DIR,
  QWEN_GLOBAL_AGENTS_DIR,
  QWEN_GLOBAL_SKILLS_DIR,
} from './constants.js';

export const target: TargetGenerators = {
  name: QWEN_CODE_TARGET,
  primaryRootInstructionPath: QWEN_ROOT,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generateHooks,
  generatePermissions,
  importFrom: importFromQwenCode,
};

function parseJsonObject(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const p: unknown = JSON.parse(s);
    return p !== null && typeof p === 'object' && !Array.isArray(p)
      ? (p as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const mergeQwenSettings: GeneratedOutputMerger = (existing, pending, newContent, resolvedPath) => {
  if (resolvedPath !== QWEN_SETTINGS && resolvedPath !== QWEN_GLOBAL_SETTINGS) return null;
  // Use in-memory pending result as base (preferred over stale disk content)
  const raw = pending?.content ?? existing;
  // Qwen documents settings.json as JSONC; rewriting an unparsable base would
  // drop the user's comments and every key in it.
  if (raw !== null) {
    const preserved = preservedUnparsableBase(raw);
    if (preserved !== null) return preserved;
  }
  const base = parseJsonObject(raw);
  try {
    const incoming = JSON.parse(newContent) as Record<string, unknown>;
    if (incoming.mcpServers !== undefined) base.mcpServers = incoming.mcpServers;
    if (incoming.hooks !== undefined) base.hooks = incoming.hooks;
    // Key-scoped inside `permissions`: a list permissions.yaml leaves out is the user's.
    if (isRecord(incoming.permissions)) {
      const basePermissions = isRecord(base.permissions) ? base.permissions : {};
      base.permissions = { ...basePermissions, ...incoming.permissions };
    }
  } catch {
    return pending?.content ?? existing ?? newContent;
  }
  return JSON.stringify(base, null, 2);
};

export const descriptor = {
  id: QWEN_CODE_TARGET,
  metadata: {
    displayName: 'Qwen Code',
    category: 'cli',
    officialUrl: 'https://github.com/QwenLM/qwen-code',
    shortDescription: "Alibaba's Qwen coding CLI",
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Qwen Code config found (QWEN.md or .qwen/rules, .qwen/commands, .qwen/settings.json).',
  lintRules,
  lint: { commands: lintCommands },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      QWEN_GLOBAL_ROOT,
      QWEN_GLOBAL_SETTINGS,
      QWEN_GLOBAL_RULES_DIR,
      QWEN_GLOBAL_COMMANDS_DIR,
      QWEN_GLOBAL_AGENTS_DIR,
      QWEN_GLOBAL_SKILLS_DIR,
    ],
    layout: globalLayout,
  },
  mergeGeneratedOutputContent: mergeQwenSettings,
  importer: qwenCodeImporterSpec,
  buildImportPaths: buildQwenCodeImportPaths,
  detectionPaths: [QWEN_ROOT, '.qwen/settings.json', '.qwen/commands', '.qwen/rules'],
} satisfies TargetDescriptor;
