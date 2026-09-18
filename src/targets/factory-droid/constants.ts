/**
 * Factory Droid target constants.
 *
 * Factory Droid is an enterprise AI coding agent by Factory AI (factory.ai).
 *
 *   - **Project config**: `AGENTS.md` at project root + `.factory/droids/`,
 *     `.factory/skills/`, `.factory/mcp.json`
 *   - **Global config**: `~/.factory/` (AGENTS.md, droids/, skills/, mcp.json)
 *
 * Factory Droid reads `AGENTS.md` for project-level instructions (with search
 * up the directory tree), `.factory/droids/` for custom sub-agents (Markdown
 * with YAML frontmatter), `.factory/skills/` for skill bundles, and
 * `.factory/mcp.json` for MCP servers.
 *
 * There is no dedicated rules directory — non-root rules are embedded in the
 * root file. Commands are merged into skills. Hooks live in a standalone
 * `hooks.json` file at each scope (`.factory/hooks.json` project,
 * `~/.factory/hooks.json` global). Settings live in `settings.json`
 * (`commandAllowlist`, `commandDenylist`). No `.factoryignore` — relies on
 * `.gitignore`.
 *
 * Assumptions (documented from official docs at docs.factory.ai):
 *   - Droids use `.md` files with YAML frontmatter in `.factory/droids/`
 *   - Skills use `SKILL.md` format in `.factory/skills/{name}/`
 *   - MCP uses standard JSON format in `.factory/mcp.json`
 *   - Legacy path: `.agent/skills/` is a backward-compat skill directory
 *   - Legacy path: `.droid.yaml` was an earlier configuration format
 */

export const FACTORY_DROID_TARGET = 'factory-droid';

// Project-level paths
export const FACTORY_DROID_ROOT_FILE = 'AGENTS.md';
export const FACTORY_DROID_SKILLS_DIR = '.factory/skills';
export const FACTORY_DROID_COMMANDS_DIR = '.factory/commands';
export const FACTORY_DROID_DROIDS_DIR = '.factory/droids';
export const FACTORY_DROID_MCP_FILE = '.factory/mcp.json';

export const FACTORY_DROID_GLOBAL_ROOT_FILE = '.factory/AGENTS.md';
export const FACTORY_DROID_GLOBAL_SKILLS_DIR = '.factory/skills';
export const FACTORY_DROID_GLOBAL_COMMANDS_DIR = '.factory/commands';
export const FACTORY_DROID_GLOBAL_DROIDS_DIR = '.factory/droids';
export const FACTORY_DROID_GLOBAL_MCP_FILE = '.factory/mcp.json';

// Hooks: primary standalone files (per docs.factory.ai/reference/hooks-reference)
export const FACTORY_DROID_HOOKS_FILE = '.factory/hooks.json';
export const FACTORY_DROID_GLOBAL_HOOKS_FILE = '.factory/hooks.json';

// Settings: permissions config (commandAllowlist / commandDenylist)
export const FACTORY_DROID_SETTINGS_FILE = '.factory/settings.json';
export const FACTORY_DROID_GLOBAL_SETTINGS_FILE = '.factory/settings.json';

// Canonical paths
