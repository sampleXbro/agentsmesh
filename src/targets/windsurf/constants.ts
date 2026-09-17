/**
 * Windsurf target constants.
 * Windsurf uses AGENTS.md (root), .windsurf/rules/*.md (modular), and .codeiumignore.
 */

export const WINDSURF_TARGET = 'windsurf';

/** Root rules file (flat, no frontmatter) */
export const WINDSURF_RULES_ROOT = '.windsurfrules';

/** Modular rules directory */
export const WINDSURF_RULES_DIR = '.windsurf/rules';

/** Ignore file path (agentsmesh legacy / community) */
export const WINDSURF_IGNORE = '.windsurfignore';

/** Official Windsurf/Codeium ignore file (docs.windsurf.com) */
export const CODEIUM_IGNORE = '.codeiumignore';

/** AGENTS.md root rule (shared with GitHub Agents spec) */
export const WINDSURF_AGENTS_MD = 'AGENTS.md';

/** Windsurf hooks file */
export const WINDSURF_HOOKS_FILE = '.windsurf/hooks.json';

/** Windsurf MCP example config path used for project-owned setup snippets */
export const WINDSURF_MCP_EXAMPLE_FILE = '.windsurf/mcp_config.example.json';

/** Windsurf MCP primary config path (import fallback only) */
export const WINDSURF_MCP_CONFIG_FILE = '.windsurf/mcp_config.json';

/** Workflows directory (.windsurf/workflows/*.md → canonical commands) */
export const WINDSURF_WORKFLOWS_DIR = '.windsurf/workflows';

/** Skills directory (.windsurf/skills/{name}/ → canonical skills) */
export const WINDSURF_SKILLS_DIR = '.windsurf/skills';

/** Global mode paths (user-level ~/.codeium/windsurf/) */
export const WINDSURF_GLOBAL_RULES = '.codeium/windsurf/memories/global_rules.md';
export const WINDSURF_GLOBAL_SKILLS_DIR = '.codeium/windsurf/skills';
export const WINDSURF_GLOBAL_WORKFLOWS_DIR = '.codeium/windsurf/global_workflows';
export const WINDSURF_GLOBAL_HOOKS_FILE = '.codeium/windsurf/hooks.json';
export const WINDSURF_GLOBAL_MCP_FILE = '.codeium/windsurf/mcp_config.json';
export const WINDSURF_GLOBAL_IGNORE = '.codeium/.codeiumignore';

/** Compatibility mirror path for skills */
export const WINDSURF_GLOBAL_AGENTS_SKILLS_DIR = '.agents/skills';
