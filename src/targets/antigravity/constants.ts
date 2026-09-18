export const ANTIGRAVITY_TARGET = 'antigravity';

export const ANTIGRAVITY_DIR = '.agents';
export const ANTIGRAVITY_RULES_DIR = `${ANTIGRAVITY_DIR}/rules`;
/** Generated main workspace instructions (canonical root remains `.agentsmesh/rules/_root.md`). */
export const ANTIGRAVITY_RULES_ROOT = `${ANTIGRAVITY_RULES_DIR}/general.md`;
export const ANTIGRAVITY_RULES_ROOT_LEGACY = `${ANTIGRAVITY_RULES_DIR}/_root.md`;
export const ANTIGRAVITY_SKILLS_DIR = `${ANTIGRAVITY_DIR}/skills`;
export const ANTIGRAVITY_WORKFLOWS_DIR = `${ANTIGRAVITY_DIR}/workflows`;
/** Project subagents, one flat file per agent (antigravity.google/docs/subagents/). */
export const ANTIGRAVITY_AGENTS_DIR = `${ANTIGRAVITY_DIR}/agents`;
/**
 * Workspace-local MCP servers. antigravity.google/docs/mcp/: "Workspace local
 * setups: Configured in your active project under .agents/mcp_config.json".
 */
export const ANTIGRAVITY_MCP_CONFIG = `${ANTIGRAVITY_DIR}/mcp_config.json`;
/**
 * Workspace ignore file. The antigravity-cli CHANGELOG (v1.1.16, 2026-08-20)
 * names `.antigravityignore` but never states its directory; the workspace root
 * is inferred from it being a per-workspace dotfile, like `.gitignore`.
 */
export const ANTIGRAVITY_IGNORE_FILE = '.antigravityignore';

export const ANTIGRAVITY_HOOKS_FILE = `${ANTIGRAVITY_DIR}/hooks.json`;
export const ANTIGRAVITY_GLOBAL_HOOKS_FILE = '.gemini/config/hooks.json';

export const ANTIGRAVITY_GLOBAL_ROOT = '.gemini/GEMINI.md';
export const ANTIGRAVITY_GLOBAL_SKILLS_DIR = '.gemini/config/skills';
export const ANTIGRAVITY_GLOBAL_WORKFLOWS_DIR = '.gemini/antigravity/global_workflows';
/** Global subagents, one directory per agent holding `agent.md`. */
export const ANTIGRAVITY_GLOBAL_AGENTS_DIR = '.gemini/config/agents';
export const ANTIGRAVITY_GLOBAL_MCP_CONFIG = '.gemini/config/mcp_config.json';
/**
 * Global CLI settings. antigravity.google/docs/cli/permissions/: the three
 * access lists are "configured inside your global settings:
 * ~/.gemini/antigravity-cli/settings.json". There is no project tier.
 */
export const ANTIGRAVITY_GLOBAL_SETTINGS_FILE = '.gemini/antigravity-cli/settings.json';

export const ANTIGRAVITY_CANONICAL_IGNORE_FILENAME = 'ignore';
