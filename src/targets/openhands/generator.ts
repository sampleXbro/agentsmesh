/**
 * Generate OpenHands outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`                                      — root rule, verbatim
 *     (rewritten to `~/.agents/skills/_root.md` in global scope)
 *   - `.agents/skills/<slug>.md`                        — path-scoped rules
 *   - `.agents/skills/<name>/SKILL.md`                  — skill bundles
 *   - `.agents/agents/<name>.md`                        — subagents
 *   - `.agents/plugins/agentsmesh/commands/<name>.md`   — `/agentsmesh:<name>`
 *   - `.openhands/hooks.json`                           — lifecycle hooks
 *
 * MCP is emitted from `emitScopedSettings` instead of a generator so the shared
 * plugin `.mcp.json` keeps keys canonical cannot express (see mcp-settings.ts).
 * `.openhands/hooks.json` goes through the same merge callback (merge.ts), which
 * is what keeps a user's `HookType.AGENT` handlers alive across a rewrite.
 */

import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeAntigravityAgent } from '../antigravity/agents-format.js';
import { buildOpenhandsHooks } from './hooks-format.js';
import { openhandsRuleSlug, serializeOpenhandsRule } from './rules-format.js';
import {
  OPENHANDS_TARGET,
  OPENHANDS_ROOT_FILE,
  OPENHANDS_SKILLS_DIR,
  OPENHANDS_AGENTS_DIR,
  OPENHANDS_COMMANDS_DIR,
  OPENHANDS_HOOKS_FILE,
} from './constants.js';

export type OpenhandsOutput = FeatureGeneratorOutput;

export function generateRules(canonical: CanonicalFiles): OpenhandsOutput[] {
  const outputs: OpenhandsOutput[] = [];

  const root = canonical.rules.find((rule) => rule.root);
  const rootBody = root?.body.trim() ?? '';
  // AGENTS.md is injected verbatim by `Skill._handle_third_party()`, which does
  // not strip frontmatter — any key here would show up as literal prompt text.
  if (rootBody) outputs.push({ path: OPENHANDS_ROOT_FILE, content: rootBody });

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes(OPENHANDS_TARGET)) continue;
    outputs.push({
      path: `${OPENHANDS_SKILLS_DIR}/${openhandsRuleSlug(rule)}.md`,
      content: serializeOpenhandsRule(rule),
    });
  }

  return outputs;
}

/**
 * The command name comes from the filename, so no `name:` key is written.
 * `argument-hint` has no canonical field, so it is never written either.
 */
export function generateCommands(canonical: CanonicalFiles): OpenhandsOutput[] {
  return canonical.commands.map((command) => {
    const frontmatter: Record<string, unknown> = {};
    if (command.description) frontmatter.description = command.description;
    if (command.allowedTools.length > 0) frontmatter['allowed-tools'] = command.allowedTools;
    return {
      path: `${OPENHANDS_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim()),
    };
  });
}

/**
 * `.agents/agents/` is shared with antigravity, so the serializer is theirs
 * verbatim: two enabled targets writing one path must produce identical bytes.
 */
export function generateAgents(canonical: CanonicalFiles): OpenhandsOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${OPENHANDS_AGENTS_DIR}/${agent.name}.md`,
    content: serializeAntigravityAgent(agent),
  }));
}

/** Same shared serializer codex-cli (the owner of `.agents/skills/`) uses. */
export function generateSkills(canonical: CanonicalFiles): OpenhandsOutput[] {
  return generateEmbeddedSkills(canonical, OPENHANDS_SKILLS_DIR);
}

export function generateHooks(canonical: CanonicalFiles): OpenhandsOutput[] {
  const document = buildOpenhandsHooks(canonical.hooks);
  if (document === null) return [];
  return [{ path: OPENHANDS_HOOKS_FILE, content: JSON.stringify(document, null, 2) }];
}

export const generatePermissions = NO_OUTPUTS;
