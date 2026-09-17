/**
 * Jules target constants.
 *
 * Jules is an asynchronous AI coding agent by Google (jules.google).
 *
 *   - **Project config**: `AGENTS.md` at project root
 *   - **Global config**: none (Jules is cloud-based via GitHub)
 *
 * Jules natively reads `AGENTS.md` for project-level instructions.
 * It also reads `README.md` for environment hints.
 * Jules is a cloud-based async agent — it clones repos into isolated VMs,
 * so there are no local skills, MCP, or global config directories.
 * Non-root rules are embedded in the root file.
 */

export const JULES_TARGET = 'jules';

// Project-level paths
export const JULES_ROOT_FILE = 'AGENTS.md';

// Canonical paths
