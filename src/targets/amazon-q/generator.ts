/**
 * Amazon Q Developer generator.
 *
 * Generates `.amazonq/rules/<slug>.md` for non-root rules.
 * The root rule is written to `.amazonq/rules/_root.md`.
 * MCP is written to `.amazonq/mcp.json`.
 * Agents are written to `.amazonq/cli-agents/<name>.json`.
 *
 * Hooks, permissions and ignore are embedded in that same agent JSON, but each is
 * gated on its own `config.features` entry, so `agent-outputs.ts` writes them from
 * the descriptor's `emitScopedSettings` hook — the only generate-time hook that sees
 * the enabled feature set. `generateAgents` here emits the ungated base file.
 *
 * Rules (resources): the agent JSON `resources` glob is what makes the generated rule
 * files readable — a custom agent inherits no default resources, and Q has no global
 * rules directory at all.
 */

import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import type {
  FeatureGeneratorOutput,
  GenerateFeatureContext,
} from '../catalog/target.interface.js';
import { isAmazonQRule } from './agent-json.js';
import { buildBaseAgentOutputs } from './agent-outputs.js';
import { AMAZON_Q_RULES_DIR, AMAZON_Q_MCP_FILE, AMAZON_Q_PROMPTS_DIR } from './constants.js';

/** `validate_prompt_name` in `cli/chat/cli/prompts.rs`. */
const AQ_PROMPT_NAME_MAX = 50;

/**
 * Coerce a canonical command name into a legal Q prompt name. Q rejects anything
 * outside `^[a-zA-Z0-9_-]+$` and never scans prompt subdirectories, so namespace
 * separators collapse into the filename rather than nesting.
 */
export function amazonQPromptName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, AQ_PROMPT_NAME_MAX);
}

export function generateRules(canonical: CanonicalFiles): FeatureGeneratorOutput[] {
  const outputs: FeatureGeneratorOutput[] = [];

  for (const rule of canonical.rules) {
    if (!isAmazonQRule(rule)) continue;

    const slug = rule.root ? '_root' : basename(rule.source, '.md');
    outputs.push({
      path: `${AMAZON_Q_RULES_DIR}/${slug}.md`,
      content: rule.body.trim(),
    });
  }

  return outputs;
}

/**
 * Q reads the whole prompt file verbatim as the prompt text, so the body is written
 * unwrapped: frontmatter would surface as literal prompt content. `description` and
 * `allowedTools` have no representation here — lintCommands warns about the loss.
 */
export function generateCommands(canonical: CanonicalFiles): FeatureGeneratorOutput[] {
  return canonical.commands.map((command) => ({
    path: `${AMAZON_Q_PROMPTS_DIR}/${amazonQPromptName(command.name)}.md`,
    content: command.body.trim(),
  }));
}

/**
 * Emits identity + `resources` only. Hooks, permissions and ignore are gated on their
 * own feature flags and added by `emitAmazonQAgentSettings`, which runs later in the
 * same generate pass and replaces this content.
 */
export function generateAgents(
  canonical: CanonicalFiles,
  ctx?: GenerateFeatureContext,
): FeatureGeneratorOutput[] {
  return buildBaseAgentOutputs(canonical, ctx?.scope ?? 'project');
}

export const generateIgnore = NO_OUTPUTS;

export const generateHooks = NO_OUTPUTS;

export const generatePermissions = NO_OUTPUTS;

export function generateMcp(canonical: CanonicalFiles): FeatureGeneratorOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  return [
    {
      path: AMAZON_Q_MCP_FILE,
      content: JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2),
    },
  ];
}
