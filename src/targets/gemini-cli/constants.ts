/**
 * Gemini CLI target constants.
 * Gemini uses GEMINI.md (root + embedded non-root rules as sections), .gemini/commands/*.toml,
 * .gemini/settings.json, and .geminiignore.
 */

export const GEMINI_TARGET = 'gemini-cli';

/** Root rules file path */
export const GEMINI_ROOT = 'GEMINI.md';

/** Compatibility root mirror file path */
export const GEMINI_COMPAT_AGENTS = 'AGENTS.md';

/**
 * Rules directory — import backward-compat only.
 * Gemini CLI has no native .gemini/rules/ directory (see docs/agent-structures/gemini-cli-project-level-advanced.md).
 * Generator folds non-root rules into GEMINI.md as sections.
 * Importer still reads this dir so users can import old agentsmesh outputs.
 */
export const GEMINI_RULES_DIR = '.gemini/rules';

/** Compatibility root mirror file path inside `.gemini/` */
export const GEMINI_COMPAT_INNER_ROOT = '.gemini/GEMINI.md';

/** Commands directory */
export const GEMINI_COMMANDS_DIR = '.gemini/commands';

/** Policies directory */
export const GEMINI_POLICIES_DIR = '.gemini/policies';

/** Settings file (MCP, ignore, hooks) */
export const GEMINI_SETTINGS = '.gemini/settings.json';

/** Ignore file */
export const GEMINI_IGNORE = '.geminiignore';

/**
 * Skills directory — compatibility mirror.
 * Not a native Gemini CLI project path. Generated as compatibility output;
 * Gemini CLI docs recommend converting skills to commands, agents, or GEMINI.md guidance.
 * See docs/agent-structures/gemini-cli-project-level-advanced.md §9.
 */
export const GEMINI_SKILLS_DIR = '.gemini/skills';

/** Agents directory (experimental native agents) */
export const GEMINI_AGENTS_DIR = '.gemini/agents';

/** Optional system prompt override */
export const GEMINI_SYSTEM = '.gemini/system.md';

/** Default workspace policies file (emitted when canonical permissions are present). */
export const GEMINI_DEFAULT_POLICIES_FILE = `${GEMINI_POLICIES_DIR}/permissions.toml`;

// Global mode paths (user-level ~/.gemini/)
export const GEMINI_GLOBAL_ROOT = '.gemini/GEMINI.md';
export const GEMINI_GLOBAL_COMPAT_AGENTS = '.gemini/AGENTS.md';
export const GEMINI_GLOBAL_SETTINGS = '.gemini/settings.json';
export const GEMINI_GLOBAL_COMMANDS_DIR = '.gemini/commands';
export const GEMINI_GLOBAL_SKILLS_DIR = '.gemini/skills';
export const GEMINI_GLOBAL_AGENTS_DIR = '.gemini/agents';
/** User-tier policy file (~/.gemini/policies/permissions.toml). Same relative path as project. */
export const GEMINI_GLOBAL_POLICIES_FILE = '.gemini/policies/permissions.toml';
