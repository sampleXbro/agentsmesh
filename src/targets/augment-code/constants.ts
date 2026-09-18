/**
 * AugmentCode target constants.
 *
 * AugmentCode is a commercial AI coding assistant with VS Code and JetBrains
 * extensions, plus the Auggie CLI.
 *
 *   - **Project config**: `.augment/` directory at project root
 *   - **Global config**: `~/.augment/` in the user home directory
 *
 * Key files:
 *   - `.augment/rules/*.md`        — scoped rules (frontmatter-driven)
 *   - `.augment/commands/*.md`     — slash commands (frontmatter-driven)
 *   - `.augment/skills/<n>/SKILL.md` — native skills (agentskills.io spec)
 *   - `.augment/settings.json`     — MCP servers, hooks, permissions (JSON5)
 *   - `.augmentignore`             — workspace indexing ignore patterns
 *
 * Official docs: https://docs.augmentcode.com/setup-augment/guidelines
 */

export const AUGMENT_CODE_TARGET = 'augment-code';

// Project-level paths
export const AUGMENT_CODE_DIR = '.augment';
export const AUGMENT_CODE_RULES_DIR = `${AUGMENT_CODE_DIR}/rules`;
export const AUGMENT_CODE_COMMANDS_DIR = `${AUGMENT_CODE_DIR}/commands`;
export const AUGMENT_CODE_AGENTS_DIR = `${AUGMENT_CODE_DIR}/agents`;
export const AUGMENT_CODE_SKILLS_DIR = `${AUGMENT_CODE_DIR}/skills`;
export const AUGMENT_CODE_SETTINGS_FILE = `${AUGMENT_CODE_DIR}/settings.json`;
export const AUGMENT_CODE_IGNORE_FILE = '.augmentignore';

// Global-level paths (~/.augment/)
export const AUGMENT_CODE_GLOBAL_DIR = '.augment';
export const AUGMENT_CODE_GLOBAL_RULES_DIR = `${AUGMENT_CODE_GLOBAL_DIR}/rules`;
export const AUGMENT_CODE_GLOBAL_COMMANDS_DIR = `${AUGMENT_CODE_GLOBAL_DIR}/commands`;
export const AUGMENT_CODE_GLOBAL_AGENTS_DIR = `${AUGMENT_CODE_GLOBAL_DIR}/agents`;
export const AUGMENT_CODE_GLOBAL_SKILLS_DIR = `${AUGMENT_CODE_GLOBAL_DIR}/skills`;
export const AUGMENT_CODE_GLOBAL_SETTINGS_FILE = `${AUGMENT_CODE_GLOBAL_DIR}/settings.json`;

// Canonical paths
