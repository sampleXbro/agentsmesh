/**
 * Replit Agent target constants.
 *
 * Replit Agent is a cloud-based AI coding assistant by Replit.
 *
 *   - **Project config**: `replit.md` for instructions + `.agents/skills/` for skills
 *   - **Global config**: none (Replit is cloud-only; no user-level file paths)
 *
 * Replit Agent natively reads `replit.md` for project-level instructions
 * and `.agents/skills/` for skill bundles.
 * Non-root rules are embedded in the root file.
 * MCP servers are configured via the Replit UI, not file-based.
 */

export const REPLIT_AGENT_TARGET = 'replit-agent';

// Project-level paths
export const REPLIT_AGENT_ROOT_FILE = 'replit.md';
export const REPLIT_AGENT_SKILLS_DIR = '.agents/skills';

// Canonical paths
