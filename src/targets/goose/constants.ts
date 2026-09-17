/**
 * Goose target constants.
 *
 * Goose is an open-source AI coding agent by Block (goose-docs.ai).
 *
 *   - **Project config**: `.goosehints` at project root + `.agents/skills/`
 *   - **Global config**: `~/.config/goose/` (.goosehints, .gooseignore)
 *
 * Goose natively reads `.goosehints` (and `AGENTS.md`) for project-level
 * instructions, `.gooseignore` for file exclusion, and `.agents/skills/`
 * for skill bundles. MCP servers land in the plugin `.mcp.json` at project scope
 * and in the `config.yaml` `extensions` block globally.
 * Lifecycle hooks follow the Open Plugin Specification: a `hooks/hooks.json`
 * inside a plugin dir under `.agents/plugins/<name>/` (auto-discovered in both
 * project and global scope). There is no dedicated rules directory — non-root
 * rules are embedded.
 */

export const GOOSE_TARGET = 'goose';

// Project-level paths
export const GOOSE_ROOT_FILE = '.goosehints';
export const GOOSE_SKILLS_DIR = '.agents/skills';
export const GOOSE_IGNORE = '.gooseignore';

// Global-level paths (~/.config/goose/)
export const GOOSE_GLOBAL_DIR = '.config/goose';
export const GOOSE_GLOBAL_ROOT_FILE = `${GOOSE_GLOBAL_DIR}/.goosehints`;
export const GOOSE_GLOBAL_IGNORE = `${GOOSE_GLOBAL_DIR}/.gooseignore`;
// Goose's primary config: provider, model, GOOSE_MODE, CLI theme and the
// builtin extension entries. agentsmesh owns the `extensions` key only, merges
// into it (global-mcp.ts) and never lists the file as a managed output.
export const GOOSE_GLOBAL_CONFIG = `${GOOSE_GLOBAL_DIR}/config.yaml`;
export const GOOSE_GLOBAL_SKILLS_DIR = '.agents/skills';
// Tool permissions — global-only YAML map keyed by category (agentsmesh owns
// the `user` block; the runtime `smart_approve` cache is merge-preserved).
export const GOOSE_GLOBAL_PERMISSIONS = `${GOOSE_GLOBAL_DIR}/permission.yaml`;

// Open Plugin Specification hooks — `hooks/hooks.json` inside an agentsmesh
// plugin dir. Same relative path in both scopes (`.agents/plugins/...`),
// rebased under the home dir in global mode (like `.agents/skills`).
export const GOOSE_HOOKS_FILE = '.agents/plugins/agentsmesh/hooks/hooks.json';

// Open Plugin MCP servers — `crates/goose/src/plugins/mcp_servers.rs` reads
// `DEFAULT_MCP_CONFIG = ".mcp.json"` from every discovered plugin root, keyed by
// a top-level `mcpServers` map, and the CLI session builder loads them for each
// new session. Same `agentsmesh` plugin dir as the hooks file. Project-only:
// `McpServerConfig` models stdio alone (command/args/env/cwd), so remote servers
// stay in the global `config.yaml` extensions block.
export const GOOSE_PROJECT_MCP_FILE = '.agents/plugins/agentsmesh/.mcp.json';

// Canonical paths
