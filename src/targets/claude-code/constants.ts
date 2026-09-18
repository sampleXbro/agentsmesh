// Claude Code target constants

export const CLAUDE_CODE_TARGET = 'claude-code';

// Project primary root instruction lives at the repo root (matches `/init` and the
// overwhelmingly common convention). The nested `.claude/CLAUDE.md` is the global-scope
// primary and the project-scope legacy location (import fallback + stale cleanup).
export const CLAUDE_ROOT = 'CLAUDE.md';
export const CLAUDE_NESTED_ROOT = '.claude/CLAUDE.md';
export const CLAUDE_RULES_DIR = '.claude/rules';
export const CLAUDE_COMMANDS_DIR = '.claude/commands';
export const CLAUDE_AGENTS_DIR = '.claude/agents';
export const CLAUDE_SKILLS_DIR = '.claude/skills';
export const CLAUDE_SETTINGS = '.claude/settings.json';
export const CLAUDE_HOOKS_JSON = '.claude/hooks.json';
export const CLAUDE_OUTPUT_STYLES_DIR = '.claude/output-styles';
export const CLAUDE_IGNORE = '.claudeignore';
export const CLAUDE_MCP_JSON = '.mcp.json';
export const CLAUDE_GLOBAL_MCP_JSON = '.claude.json';
