/**
 * Amp (Sourcegraph) target constants.
 *
 * Amp is a coding agent by Sourcegraph (ampcode.com).
 *
 *   - **Project config**: `AGENTS.md` at project root + `.agents/skills/` + `.amp/settings.json`
 *   - **Global config**: `~/.config/amp/` (AGENTS.md, skills/, settings.json)
 *
 * Amp natively reads `AGENTS.md` for project-level instructions,
 * `.agents/skills/` for skill bundles, and `.amp/settings.json` for
 * MCP servers and workspace settings. There is no dedicated rules
 * directory — non-root rules are embedded in the root file.
 */

export const AMP_TARGET = 'amp';

// Project-level paths
export const AMP_ROOT_FILE = 'AGENTS.md';
export const AMP_SKILLS_DIR = '.agents/skills';
export const AMP_MCP_FILE = '.amp/settings.json';

// Global-level paths (~/.config/amp/)
export const AMP_GLOBAL_DIR = '.config/amp';
export const AMP_GLOBAL_ROOT_FILE = `${AMP_GLOBAL_DIR}/AGENTS.md`;
export const AMP_GLOBAL_SKILLS_DIR = `${AMP_GLOBAL_DIR}/skills`;
export const AMP_GLOBAL_MCP_FILE = `${AMP_GLOBAL_DIR}/settings.json`;

// Canonical paths
