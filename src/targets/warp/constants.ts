/**
 * Warp target constants.
 *
 * Warp is an agentic development environment by Warp.dev.
 *
 *   - **Project config**: `AGENTS.md` (or legacy `WARP.md`) + `.warp/skills/` +
 *     `.warp/.mcp.json` + `.warpindexingignore`
 *   - **Global config**: `~/.agents/AGENTS.md` (rules) + `~/.warp/skills/` +
 *     `~/.warp/.mcp.json` + `~/.warp/settings.toml` (agent permissions)
 *
 * Warp natively reads `AGENTS.md` for project-level instructions,
 * `.warp/skills/` for skill bundles, and `.warp/.mcp.json` (standard format)
 * for MCP servers at the project root. Globally, Warp reads `~/.warp/.mcp.json`
 * (same standard `mcpServers` JSON shape, rebased under the home dir).
 * Non-root rules are embedded in the root file.
 * `WARP.md` is a legacy root file that takes priority over `AGENTS.md`.
 *
 * Note: Warp also reads the cross-tool compatibility path `.mcp.json` (root,
 * no subdirectory) via autodiscovery for interoperability with Claude Code, but
 * `.warp/.mcp.json` is Warp's own native project-scope surface.
 */

export const WARP_TARGET = 'warp';

// Project-level paths
export const WARP_ROOT_FILE = 'AGENTS.md';
export const WARP_LEGACY_ROOT_FILE = 'WARP.md';
export const WARP_SKILLS_DIR = '.warp/skills';
// Warp's native project-level MCP config. Both project and global scopes use
// the .warp/ directory: `.warp/.mcp.json` at the project root, and
// `~/.warp/.mcp.json` globally. The agentsmesh engine rebases the path under
// the home dir for global mode.
export const WARP_MCP_FILE = '.warp/.mcp.json';

/**
 * Codebase-indexing exclusions, gitignore syntax
 * (docs.warp.dev/agents/capabilities/codebase-context). Warp also honours
 * `.gitignore`, `.cursorignore`, `.cursorindexingignore` and `.codeiumignore`,
 * but those files belong to other tools — agentsmesh only writes Warp's own.
 */
export const WARP_IGNORE_FILE = '.warpindexingignore';

// Global-level paths (~/)
export const WARP_GLOBAL_SKILLS_DIR = '.warp/skills';
export const WARP_GLOBAL_MCP_FILE = '.warp/.mcp.json';

/**
 * Machine-wide rules: "A rule file at `~/.agents/AGENTS.md` applies across all
 * projects on your machine" (docs.warp.dev/agents/cli/configuration).
 *
 * Caveat: the desktop app surfaces Global Rules as Warp Drive / Settings
 * entries with no documented file path. The on-disk file is documented for the
 * Warp Agent CLI, which "gives its agent the same layered context system as
 * the Warp app" and shares its rule and skill locations.
 */
export const WARP_GLOBAL_ROOT_FILE = '.agents/AGENTS.md';

/**
 * Hot-reloaded user settings file (docs.warp.dev/terminal/settings). Agent
 * permissions live under `[agents.profiles]`.
 *
 * Platform caveat: this is the documented **macOS stable** location. Warp uses
 * `~/.config/warp-terminal/settings.toml` on Linux and
 * `%LOCALAPPDATA%\warp\Warp\config\settings.toml` on Windows. agentsmesh's
 * global scope is a single home-relative path, so it emits the macOS one —
 * matching `~/.warp/.mcp.json`, Warp's other home-relative surface here.
 * Linux/Windows users must copy or symlink the file.
 */
export const WARP_GLOBAL_SETTINGS_FILE = '.warp/settings.toml';

// Canonical paths
