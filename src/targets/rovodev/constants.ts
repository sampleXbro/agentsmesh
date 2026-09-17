/**
 * Rovo Dev target constants.
 *
 * Rovo Dev is Atlassian's AI-powered coding agent, available as a CLI
 * and in Bitbucket/GitHub integrations.
 *
 *   - **Project config**: `AGENTS.md` + `.rovodev/skills/` + `.rovodev/prompts.yml`
 *   - **Global config**: `~/.rovodev/AGENTS.md` + `~/.rovodev/skills/` +
 *     `~/.rovodev/prompts.yml` + `~/.rovodev/mcp_config.json` + `~/.rovodev/config.yml`
 *
 * Rovo Dev reads `AGENTS.md` for project-level instructions (memory),
 * `.rovodev/skills/` for skill bundles, and `.rovodev/prompts.yml` (+ referenced
 * `.rovodev/commands/*.md` content files) for saved/reusable prompts (custom
 * commands). Non-root rules are embedded in the root file.
 * Subagents live in `.rovodev/subagents/` but are projected as skills.
 *
 * MCP has no project-level config file — only `~/.rovodev/mcp_config.json`
 * (global) is documented:
 * https://support.atlassian.com/rovo/docs/manage-rovo-dev-cli-settings/
 */

export const ROVODEV_TARGET = 'rovodev';

// Project-level paths
export const ROVODEV_ROOT_FILE = 'AGENTS.md';
export const ROVODEV_DIR = '.rovodev';
export const ROVODEV_SKILLS_DIR = `${ROVODEV_DIR}/skills`;
export const ROVODEV_COMMANDS_DIRNAME = 'commands';
export const ROVODEV_COMMANDS_DIR = `${ROVODEV_DIR}/${ROVODEV_COMMANDS_DIRNAME}`;
export const ROVODEV_PROMPTS_FILE = `${ROVODEV_DIR}/prompts.yml`;

// Global-level paths (~/.rovodev/)
export const ROVODEV_GLOBAL_DIR = '.rovodev';
export const ROVODEV_GLOBAL_ROOT_FILE = '.rovodev/AGENTS.md';
export const ROVODEV_GLOBAL_SKILLS_DIR = '.rovodev/skills';
export const ROVODEV_GLOBAL_COMMANDS_DIR = `${ROVODEV_GLOBAL_DIR}/${ROVODEV_COMMANDS_DIRNAME}`;
export const ROVODEV_GLOBAL_PROMPTS_FILE = `${ROVODEV_GLOBAL_DIR}/prompts.yml`;
export const ROVODEV_GLOBAL_MCP_FILE = `${ROVODEV_GLOBAL_DIR}/mcp_config.json`;
export const ROVODEV_GLOBAL_CONFIG_FILE = '.rovodev/config.yml';
