// Cursor target constants

export const CURSOR_TARGET = 'cursor';

export const CURSOR_COMPAT_AGENTS = 'AGENTS.md';
export const CURSOR_LEGACY_RULES = '.cursorrules';
export const CURSOR_RULES_DIR = '.cursor/rules';
export const CURSOR_GENERAL_RULE = `${CURSOR_RULES_DIR}/general.mdc`;
export const CURSOR_COMMANDS_DIR = '.cursor/commands';
export const CURSOR_AGENTS_DIR = '.cursor/agents';
export const CURSOR_SKILLS_DIR = '.cursor/skills';
export const CURSOR_MCP = '.cursor/mcp.json';
export const CURSOR_HOOKS = '.cursor/hooks.json';
export const CURSOR_SETTINGS = '.cursor/settings.json';
export const CURSOR_IGNORE = '.cursorignore';
export const CURSOR_INDEXING_IGNORE = '.cursorindexingignore';
export const CURSOR_CLI_JSON = '.cursor/cli.json';
/** Global-scope Cursor CLI config path: ~/.cursor/cli-config.json (distinct filename from project-scope). */
export const CURSOR_GLOBAL_CLI_CONFIG = '.cursor/cli-config.json';

/** Legacy global merged rules path (import still reads this when present). */
export const CURSOR_GLOBAL_EXPORT_DIR = '.agentsmesh-exports/cursor';
export const CURSOR_GLOBAL_USER_RULES = `${CURSOR_GLOBAL_EXPORT_DIR}/user-rules.md`;
/** Cross-tool aggregate under `~/.cursor/` (see docs/agent-structures/cursor-global-level-generation-strategy.md). */
export const CURSOR_DOT_CURSOR_AGENTS = '.cursor/AGENTS.md';
// Global Cursor uses the same `.cursor/...` paths as project mode (tooling
// loads from `~/.cursor/`). Earlier code aliased `CURSOR_MCP` /
// `CURSOR_SKILLS_DIR` / `CURSOR_AGENTS_DIR` as `CURSOR_GLOBAL_*` for read-
// site clarity, but the aliases were structurally identical — knip flagged
// them as duplicate exports, so call sites import the project-mode names
// directly and the global layout reuses them verbatim.
