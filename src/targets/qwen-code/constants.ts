/**
 * Qwen Code target constants.
 *
 * Qwen Code is Alibaba's CLI coding agent (powered by Qwen3 models).
 * Config lives under `.qwen/` at project level and `~/.qwen/` globally.
 *
 *   - **Root instruction file**: `QWEN.md` (default, configurable via context.fileName)
 *   - **Project config dir**: `.qwen/` (settings.json, skills/, commands/, agents/)
 *   - **Global config dir**: `~/.qwen/` (settings.json, QWEN.md)
 *   - **Settings**: `.qwen/settings.json` — MCP (mcpServers), hooks, permissions
 *   - **Ignore**: `.qwenignore` (gitignore-style)
 *
 * Reference: https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/
 */

export const QWEN_CODE_TARGET = 'qwen-code';

// Project-level paths
export const QWEN_ROOT = 'QWEN.md';
export const QWEN_RULES_DIR = '.qwen/rules';
export const QWEN_COMMANDS_DIR = '.qwen/commands';
export const QWEN_AGENTS_DIR = '.qwen/agents';
export const QWEN_SKILLS_DIR = '.qwen/skills';
export const QWEN_SETTINGS = '.qwen/settings.json';
export const QWEN_IGNORE = '.qwenignore';

export const QWEN_GLOBAL_ROOT = '.qwen/QWEN.md';
export const QWEN_GLOBAL_SETTINGS = '.qwen/settings.json';
export const QWEN_GLOBAL_COMMANDS_DIR = '.qwen/commands';
export const QWEN_GLOBAL_SKILLS_DIR = '.qwen/skills';
export const QWEN_GLOBAL_AGENTS_DIR = '.qwen/agents';
/**
 * `~/.qwen/rules/` — Qwen Code's `loadRules()` (rulesDiscovery.ts) reads rule
 * files from BOTH this global dir and the project `.qwen/rules/` dir, using
 * the identical recursive-.md-with-frontmatter mechanism. Native, not embedded.
 */
export const QWEN_GLOBAL_RULES_DIR = '.qwen/rules';

// Canonical paths
