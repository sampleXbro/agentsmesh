export const JUNIE_TARGET = 'junie';

// Project-level paths
export const JUNIE_DIR = '.junie';
export const JUNIE_GUIDELINES = `${JUNIE_DIR}/guidelines.md`;
export const JUNIE_CI_GUIDELINES = `${JUNIE_DIR}/ci-guidelines.md`;
export const JUNIE_DOT_AGENTS = `${JUNIE_DIR}/AGENTS.md`;
export const JUNIE_AGENTS_FALLBACK = 'AGENTS.md';
export const JUNIE_MCP_DIR = `${JUNIE_DIR}/mcp`;
export const JUNIE_MCP_FILE = `${JUNIE_MCP_DIR}/mcp.json`;
export const JUNIE_SKILLS_DIR = `${JUNIE_DIR}/skills`;
export const JUNIE_RULES_DIR = `${JUNIE_DIR}/rules`;
export const JUNIE_COMMANDS_DIR = `${JUNIE_DIR}/commands`;
export const JUNIE_AGENTS_DIR = `${JUNIE_DIR}/agents`;
export const JUNIE_IGNORE = '.aiignore';

// Global-level paths (~/.junie/)
export const JUNIE_GLOBAL_DIR = '.junie';
export const JUNIE_GLOBAL_SKILLS_DIR = `${JUNIE_GLOBAL_DIR}/skills`;
export const JUNIE_GLOBAL_AGENTS_DIR = `${JUNIE_GLOBAL_DIR}/agents`;
export const JUNIE_GLOBAL_COMMANDS_DIR = `${JUNIE_GLOBAL_DIR}/commands`;
export const JUNIE_GLOBAL_MCP_DIR = `${JUNIE_GLOBAL_DIR}/mcp`;
export const JUNIE_GLOBAL_MCP_FILE = `${JUNIE_GLOBAL_MCP_DIR}/mcp.json`;
export const JUNIE_GLOBAL_AGENTS_MD = `${JUNIE_GLOBAL_DIR}/AGENTS.md`;

// Cross-agent compatibility mirror
export const JUNIE_GLOBAL_AGENTS_SKILLS_DIR = '.agents/skills';

// Global allowlist
export const JUNIE_GLOBAL_ALLOWLIST = `.junie/allowlist.json`;

// Global config file — multi-feature JSON (model, provider, brave, mcp-locations, hooks, etc.)
export const JUNIE_GLOBAL_CONFIG = `.junie/config.json`;
