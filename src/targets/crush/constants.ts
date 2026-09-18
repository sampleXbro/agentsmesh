/**
 * Crush target constants.
 *
 * Crush is a terminal TUI AI coding agent by Charmbracelet.
 * https://github.com/charmbracelet/crush
 *
 *   - **Project config**: `crush.json` / `.crush.json` at project root
 *   - **Global config**: `~/.config/crush/crush.json`
 *   - **Context file**: `AGENTS.md` (or `CRUSH.md`, `CLAUDE.md`, `GEMINI.md`)
 *   - **Skills**: `.crush/skills/` (also reads `.agents/skills/` by default)
 *   - **Ignore**: `.crushignore` (project) / `~/.config/crush/ignore` (global)
 *
 * Crush reads multiple context files (AGENTS.md, CRUSH.md, CLAUDE.md, GEMINI.md)
 * at project root; we generate to `CRUSH.md` to avoid collisions with Amp's AGENTS.md.
 * MCP, hooks, and permissions all live in `crush.json`.
 */

export const CRUSH_TARGET = 'crush';

// Project-scope paths
export const CRUSH_ROOT_FILE = 'CRUSH.md';
export const CRUSH_SKILLS_DIR = '.crush/skills';
export const CRUSH_CONFIG_FILE = 'crush.json';
export const CRUSH_IGNORE = '.crushignore';

// Global-scope paths (~/.config/crush/)
export const CRUSH_GLOBAL_CONFIG_DIR = '.config/crush';
export const CRUSH_GLOBAL_CONFIG_FILE = `${CRUSH_GLOBAL_CONFIG_DIR}/crush.json`;
export const CRUSH_GLOBAL_SKILLS_DIR = '.config/crush/skills';
export const CRUSH_GLOBAL_ROOT_FILE = `${CRUSH_GLOBAL_CONFIG_DIR}/CRUSH.md`;
// Extensionless and dotless by design: Crush joins home.Config()/crush/ignore
// and parses it with the same gitignore rules as `.crushignore`.
export const CRUSH_GLOBAL_IGNORE = `${CRUSH_GLOBAL_CONFIG_DIR}/ignore`;

// Canonical paths for import mapping
