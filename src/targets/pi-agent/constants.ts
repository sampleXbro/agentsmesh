/**
 * Pi Coding Agent target constants.
 *
 * Pi is a terminal coding agent by Mario Zechner (earendil-works/pi).
 *
 *   - **Project config**: `AGENTS.md` at project root + `.pi/skills/`
 *   - **Global config**: `~/.pi/agent/` (AGENTS.md, skills/, settings.json)
 *
 * Pi natively reads `AGENTS.md` (or `CLAUDE.md`) for project-level
 * instructions, `.pi/skills/` and `.agents/skills/` for skill bundles,
 * and `.pi/settings.json` for project settings. There is no dedicated
 * rules directory -- non-root rules are embedded in the root file.
 */

export const PI_AGENT_TARGET = 'pi-agent';

// Project-level paths
export const PI_AGENT_ROOT_FILE = 'AGENTS.md';
export const PI_AGENT_SKILLS_DIR = '.pi/skills';
export const PI_AGENT_COMMANDS_DIR = '.pi/prompts';
export const PI_AGENT_SETTINGS_FILE = '.pi/settings.json';

// Global-level paths (~/.pi/agent/)
export const PI_AGENT_GLOBAL_DIR = '.pi/agent';
export const PI_AGENT_GLOBAL_ROOT_FILE = `${PI_AGENT_GLOBAL_DIR}/AGENTS.md`;
export const PI_AGENT_GLOBAL_SKILLS_DIR = `${PI_AGENT_GLOBAL_DIR}/skills`;
export const PI_AGENT_GLOBAL_COMMANDS_DIR = `${PI_AGENT_GLOBAL_DIR}/prompts`;
export const PI_AGENT_GLOBAL_SETTINGS_FILE = `${PI_AGENT_GLOBAL_DIR}/settings.json`;

// Canonical paths
