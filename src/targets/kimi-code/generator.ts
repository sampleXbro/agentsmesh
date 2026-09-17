/**
 * Generate Kimi Code CLI outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`             — root rule + embedded non-root rules (global
 *                               scope rebases this to `~/.kimi-code/AGENTS.md`)
 *   - `.kimi-code/agents/`    — native agent definitions
 *   - `.kimi-code/skills/`    — skill bundles, plus commands projected as skills
 *   - `.kimi-code/mcp.json`   — MCP servers (`mcpServers`, both scopes)
 *
 * Hooks and permissions live in the user-level `config.toml` only, so they are
 * emitted from `globalSupport.scopeExtras` (see `scope-extras.ts`); the stubs
 * below keep the engine's project-scope dispatch from inventing a file.
 */

import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalAgent, CanonicalFiles } from '../../core/types.js';
import type { GenerateFeatureContext } from '../catalog/target.interface.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { appendEmbeddedRulesBlock } from '../projection/managed-blocks.js';
import { commandSkillDirName, serializeCommandSkill } from '../codex-cli/command-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { isLoadableKimiMcpServer, serializeKimiMcpServer } from './mcp-format.js';
import {
  KIMI_CODE_TARGET,
  KIMI_CODE_ROOT_FILE,
  KIMI_CODE_AGENTS_DIR,
  KIMI_CODE_SKILLS_DIR,
  KIMI_CODE_MCP_FILE,
} from './constants.js';

export type KimiCodeOutput = FeatureGeneratorOutput;

/**
 * One instruction file per scope, with non-root rules in a managed block.
 * Kimi Code concatenates every instruction file it finds, so writing a second
 * one would duplicate context rather than extend it; and it has no per-rule
 * rules directory, which is why `additionalRules` is `embedded`.
 */
export function generateRules(
  canonical: CanonicalFiles,
  _ctx?: GenerateFeatureContext,
): KimiCodeOutput[] {
  const root = canonical.rules.find((rule) => rule.root);
  const nonRoot = canonical.rules.filter(
    (rule) => !rule.root && (rule.targets.length === 0 || rule.targets.includes(KIMI_CODE_TARGET)),
  );
  const content = appendEmbeddedRulesBlock(root?.body.trim() ?? '', nonRoot);
  if (!content) return [];
  return [{ path: KIMI_CODE_ROOT_FILE, content }];
}

/** Frontmatter keys Kimi Code agent files define; anything else is lint-reported. */
function agentFrontmatter(agent: CanonicalAgent): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
    tools: agent.tools.length > 0 ? agent.tools : undefined,
    disallowedTools: agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
  };
  for (const key of Object.keys(frontmatter)) {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  }
  return frontmatter;
}

export function generateAgents(canonical: CanonicalFiles): KimiCodeOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${KIMI_CODE_AGENTS_DIR}/${agent.name}.md`,
    content: serializeFrontmatter(agentFrontmatter(agent), agent.body.trim() || ''),
  }));
}

export function generateSkills(canonical: CanonicalFiles): KimiCodeOutput[] {
  return generateEmbeddedSkills(canonical, KIMI_CODE_SKILLS_DIR);
}

/** Kimi Code has no command file format; commands ride in as skill bundles. */
export function generateCommands(canonical: CanonicalFiles): KimiCodeOutput[] {
  return canonical.commands.map((command) => ({
    path: `${KIMI_CODE_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

/** See `mcp-format.ts`: the transport is named, and unloadable servers are dropped. */
export function generateMcp(
  canonical: CanonicalFiles,
  _ctx?: GenerateFeatureContext,
): KimiCodeOutput[] {
  if (!canonical.mcp) return [];
  const mcpServers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(canonical.mcp.mcpServers)) {
    if (isLoadableKimiMcpServer(server)) mcpServers[name] = serializeKimiMcpServer(server);
  }
  if (Object.keys(mcpServers).length === 0) return [];
  return [{ path: KIMI_CODE_MCP_FILE, content: JSON.stringify({ mcpServers }, null, 2) }];
}

export const generateHooks = NO_OUTPUTS;

export const generatePermissions = NO_OUTPUTS;
