export const CONTINUE_TARGET = 'continue';

export const CONTINUE_RULES_DIR = '.continue/rules';
export const CONTINUE_PROMPTS_DIR = '.continue/prompts';
export const CONTINUE_MCP_DIR = '.continue/mcpServers';
export const CONTINUE_MCP_FILE = `${CONTINUE_MCP_DIR}/agentsmesh.json`;
/** Generated main rule file (canonical root remains `.agentsmesh/rules/_root.md`). */
export const CONTINUE_ROOT_RULE = `${CONTINUE_RULES_DIR}/general.md`;
export const CONTINUE_ROOT_RULE_LEGACY = `${CONTINUE_RULES_DIR}/_root.md`;
export const CONTINUE_SKILLS_DIR = '.continue/skills';
/** Agent files (`<name>.md`) at both scopes; `*.yaml` here is a user assistant profile. */
export const CONTINUE_AGENTS_DIR = '.continue/agents';
/** Hooks live under the `hooks` key of this file at both scopes. */
export const CONTINUE_SETTINGS = '.continue/settings.json';

export const CONTINUE_GLOBAL_AGENTS_MD = '.continue/AGENTS.md';
export const CONTINUE_GLOBAL_CONFIG = '.continue/config.yaml';
/** Personal tool permissions (global tier only — project tier is unsupported upstream). */
export const CONTINUE_GLOBAL_PERMISSIONS = '.continue/permissions.yaml';

/** Project-scope ignore file (gitignore format, at project root). */
export const CONTINUE_IGNORE = '.continueignore';
/** Global-scope ignore file (~/.continue/.continueignore). */
export const CONTINUE_GLOBAL_IGNORE = '.continue/.continueignore';
