/**
 * Zed target constants.
 *
 * Zed is a modern code editor with built-in AI assistant (zed.dev).
 *
 *   - **Project config**: `.rules` + `.zed/settings.json`
 *   - **Global config**: `~/.config/zed/AGENTS.md` + `~/.config/zed/settings.json`
 *     + `~/.agents/skills/`
 *
 * Zed natively reads `.rules` for project-level AI instructions,
 * `.zed/settings.json` for MCP servers (`context_servers`) and file exclusions,
 * and `.agents/skills/` for skill bundles (globally: `~/.agents/skills/`).
 * There is no dedicated rules directory — non-root rules are embedded
 * in the single root instruction file. No native commands or agents.
 *
 * The personal instruction file is `config_dir()/AGENTS.md`
 * (`crates/paths/src/paths.rs` `agents_file()`; `%APPDATA%\Zed\AGENTS.md` on
 * Windows). It replaced the database-backed Rules Library in v1.4.0, and since
 * it is the ONE global instruction file, secondary rules can only be
 * concatenated into it.
 */

export const ZED_TARGET = 'zed';

// Project-level paths
export const ZED_ROOT_FILE = '.rules';
export const ZED_SETTINGS_FILE = '.zed/settings.json';
export const ZED_SKILLS_DIR = '.agents/skills';

// Global-level paths (~/.config/zed/ and ~/.agents/)
export const ZED_GLOBAL_DIR = '.config/zed';
export const ZED_GLOBAL_ROOT_FILE = `${ZED_GLOBAL_DIR}/AGENTS.md`;
export const ZED_GLOBAL_SETTINGS_FILE = `${ZED_GLOBAL_DIR}/settings.json`;
/** Global skills directory — Zed v1.4.0+ reads ~/.agents/skills/ for all projects. */
export const ZED_GLOBAL_SKILLS_DIR = '.agents/skills';

// Canonical paths
