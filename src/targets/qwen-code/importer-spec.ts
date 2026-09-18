/**
 * Qwen Code importer descriptor — declarative scan+map rules for the shared
 * `runDescriptorImport` orchestrator.
 */

import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetImporterDescriptor } from '../catalog/import-descriptor.js';
import {
  QWEN_ROOT,
  QWEN_RULES_DIR,
  QWEN_COMMANDS_DIR,
  QWEN_AGENTS_DIR,
  QWEN_SETTINGS,
  QWEN_IGNORE,
  QWEN_GLOBAL_ROOT,
  QWEN_GLOBAL_RULES_DIR,
  QWEN_GLOBAL_COMMANDS_DIR,
  QWEN_GLOBAL_AGENTS_DIR,
  QWEN_GLOBAL_SETTINGS,
} from './constants.js';

export const qwenCodeImporterSpec: TargetImporterDescriptor = {
  rules: [
    {
      feature: 'rules' as const,
      mode: 'singleFile' as const,
      source: {
        project: [QWEN_ROOT],
        global: [QWEN_GLOBAL_ROOT],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    {
      feature: 'rules' as const,
      mode: 'directory' as const,
      source: {
        project: [QWEN_RULES_DIR],
        global: [QWEN_GLOBAL_RULES_DIR],
      },
      canonicalDir: AB_RULES,
      extensions: ['.md'],
      preset: 'rule' as const,
      // Qwen Code rule files use `paths:` for path-conditional injection (never
      // `globs:` — see rulesDiscovery.ts). Remap onto the canonical `globs` field.
      frontmatterRemap: ({ description, paths }) => ({
        description: typeof description === 'string' ? description : undefined,
        globs: Array.isArray(paths) ? paths : undefined,
      }),
    },
  ],
  commands: {
    feature: 'commands' as const,
    mode: 'directory' as const,
    source: {
      project: [QWEN_COMMANDS_DIR],
      global: [QWEN_GLOBAL_COMMANDS_DIR],
    },
    canonicalDir: AB_COMMANDS,
    extensions: ['.md'],
    preset: 'command' as const,
  },
  agents: {
    feature: 'agents' as const,
    mode: 'directory' as const,
    source: {
      project: [QWEN_AGENTS_DIR],
      global: [QWEN_GLOBAL_AGENTS_DIR],
    },
    canonicalDir: AB_AGENTS,
    extensions: ['.md'],
    preset: 'agent' as const,
  },
  mcp: {
    feature: 'mcp' as const,
    mode: 'mcpJson' as const,
    source: {
      project: [QWEN_SETTINGS],
      global: [QWEN_GLOBAL_SETTINGS],
    },
    canonicalDir: '.agentsmesh',
    canonicalFilename: '.agentsmesh/mcp.json',
  },
  ignore: {
    feature: 'ignore' as const,
    mode: 'flatFile' as const,
    source: {
      project: [QWEN_IGNORE],
      global: [],
    },
    canonicalDir: '.agentsmesh',
    canonicalFilename: '.agentsmesh/ignore',
  },
};
