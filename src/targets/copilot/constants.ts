/**
 * Copilot target constants.
 * GitHub Copilot uses .github/copilot-instructions.md, .github/instructions/*.instructions.md,
 * .github/hooks/*.json, and .github/prompts/*.prompt.md.
 */

export const COPILOT_TARGET = 'copilot';

/** Global instructions file path */
export const COPILOT_INSTRUCTIONS = '.github/copilot-instructions.md';

/** Legacy per-context instructions directory */
export const COPILOT_CONTEXT_DIR = '.github/copilot';

/** Current instructions directory (GitHub Copilot CLI) */
export const COPILOT_INSTRUCTIONS_DIR = '.github/instructions';

/** Prompt files directory (manual reusable prompts / command-like tasks) */
export const COPILOT_PROMPTS_DIR = '.github/prompts';

/** Hooks directory for JSON hook configs and scripts */
export const COPILOT_HOOKS_DIR = '.github/hooks';

/** Agent skills directory (native). [gh:skills] */
export const COPILOT_SKILLS_DIR = '.github/skills';

/** Custom agent profiles directory (.agent.md files). [gh:agents] */
export const COPILOT_AGENTS_DIR = '.github/agents';

export const COPILOT_LEGACY_HOOKS_DIR = '.github/copilot-hooks';

export const COPILOT_GLOBAL_INSTRUCTIONS = '.copilot/copilot-instructions.md';
export const COPILOT_GLOBAL_AGENTS_DIR = '.copilot/agents';
export const COPILOT_GLOBAL_SKILLS_DIR = '.copilot/skills';
export const COPILOT_GLOBAL_AGENTS_MD = '.copilot/AGENTS.md';

/** User-level MCP config (Copilot CLI). `mcpServers` key, distinct from the
 * project `.vscode/mcp.json` `servers` key. */
export const COPILOT_GLOBAL_MCP = '.copilot/mcp-config.json';

/** User-level hooks directory (Copilot CLI). Same `{version, hooks}` schema
 * as the project `.github/hooks/` directory. */
export const COPILOT_GLOBAL_HOOKS_DIR = '.copilot/hooks';

/** Compatibility mirror paths for skills */
export const COPILOT_GLOBAL_CLAUDE_SKILLS_DIR = '.claude/skills';
export const COPILOT_GLOBAL_AGENTS_SKILLS_DIR = '.agents/skills';

/** MCP configuration file (project scope) */
export const COPILOT_MCP_JSON = '.vscode/mcp.json';
