/**
 * Copilot importer descriptor — declarative scan+map rules dispatched by the
 * shared `runDescriptorImport` orchestrator.
 *
 * MCP round-trips through `.vscode/mcp.json`. Copilot writes the server map under
 * the VS Code `servers` key (not `mcpServers`), so the spec sets `mcpServersKey`.
 */

import { AB_AGENTS, AB_COMMANDS, AB_MCP, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetImporterDescriptor } from '../catalog/import-descriptor.js';
import {
  COPILOT_INSTRUCTIONS,
  COPILOT_INSTRUCTIONS_DIR,
  COPILOT_CONTEXT_DIR,
  COPILOT_PROMPTS_DIR,
  COPILOT_AGENTS_DIR,
  COPILOT_MCP_JSON,
  COPILOT_GLOBAL_INSTRUCTIONS,
  COPILOT_GLOBAL_AGENTS_DIR,
} from './constants.js';
import {
  copilotAgentMapper,
  copilotCommandMapper,
  copilotLegacyRuleMapper,
  copilotNewRuleMapper,
} from './import-mappers.js';

export const copilotImporterSpec: TargetImporterDescriptor = {
  rules: [
    {
      // Root: scope-aware singleFile.
      feature: 'rules',
      mode: 'singleFile',
      source: { project: [COPILOT_INSTRUCTIONS], global: [COPILOT_GLOBAL_INSTRUCTIONS] },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    {
      // Legacy `.github/copilot/*.instructions.md` — project only.
      feature: 'rules',
      mode: 'directory',
      source: { project: [COPILOT_CONTEXT_DIR] },
      canonicalDir: AB_RULES,
      extensions: ['.instructions.md'],
      map: copilotLegacyRuleMapper,
    },
    {
      // New `.github/instructions/*.{instructions.md,md}` — project only,
      // uses `applyTo` instead of `globs`.
      feature: 'rules',
      mode: 'directory',
      source: { project: [COPILOT_INSTRUCTIONS_DIR] },
      canonicalDir: AB_RULES,
      extensions: ['.instructions.md', '.md'],
      map: copilotNewRuleMapper,
    },
  ],
  commands: {
    // Project scope only: Copilot CLI has no global commands surface (see
    // globalCapabilities.commands = 'none' in capabilities.ts).
    feature: 'commands',
    mode: 'directory',
    source: { project: [COPILOT_PROMPTS_DIR] },
    canonicalDir: AB_COMMANDS,
    extensions: ['.prompt.md'],
    map: copilotCommandMapper,
  },
  agents: {
    feature: 'agents',
    mode: 'directory',
    source: { project: [COPILOT_AGENTS_DIR], global: [COPILOT_GLOBAL_AGENTS_DIR] },
    canonicalDir: AB_AGENTS,
    extensions: ['.agent.md'],
    map: copilotAgentMapper,
  },
  mcp: {
    // `.vscode/mcp.json` uses the VS Code `servers` key (project scope only).
    feature: 'mcp',
    mode: 'mcpJson',
    source: { project: [COPILOT_MCP_JSON] },
    canonicalDir: '.agentsmesh',
    canonicalFilename: AB_MCP,
    mcpServersKey: 'servers',
  },
};
