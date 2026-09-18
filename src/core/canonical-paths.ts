/**
 * The canonical `.agentsmesh/` layout — agentsmesh's OWN paths, not per-target
 * data. Every target's `constants.ts` aliases these instead of re-declaring the
 * literals, so the layout has exactly one definition.
 */

export const AB_RULES = '.agentsmesh/rules';
export const AB_ROOT_RULE = '.agentsmesh/rules/_root.md';
export const AB_COMMANDS = '.agentsmesh/commands';
export const AB_AGENTS = '.agentsmesh/agents';
export const AB_SKILLS = '.agentsmesh/skills';
export const AB_MCP = '.agentsmesh/mcp.json';
export const AB_IGNORE = '.agentsmesh/ignore';
export const AB_PERMISSIONS = '.agentsmesh/permissions.yaml';
export const AB_HOOKS = '.agentsmesh/hooks.yaml';
