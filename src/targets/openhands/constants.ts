/**
 * OpenHands target constants.
 *
 * OpenHands is the open-source autonomous coding agent formerly called
 * OpenDevin (docs.openhands.dev). Config loading lives in the separate
 * `software-agent-sdk` repo, not in the app repo.
 *
 *   - **Project config**: `AGENTS.md`, the shared `.agents/` open-plugin tree,
 *     and `.openhands/hooks.json`
 *   - **Global config**: `~/.agents/` and `~/.openhands/` — the same relative
 *     paths rebased under the home directory, except the root rule, which has
 *     no `~/AGENTS.md` equivalent and becomes an always-injected skill file.
 *
 * `.agents/skills/`, `.agents/agents/` and `.agents/plugins/` are shared
 * open-spec directories that agentsmesh targets already write: codex-cli owns
 * `.agents/skills/`, antigravity writes `.agents/agents/`, goose writes
 * `.agents/plugins/agentsmesh/`. Everything openhands emits there reuses those
 * targets' serializers verbatim so the bytes match and `resolveOutputCollisions`
 * has nothing to fail on.
 */

export const OPENHANDS_TARGET = 'openhands';

// Project-level paths
/** Injected VERBATIM by `Skill._handle_third_party()` — never emit frontmatter here. */
export const OPENHANDS_ROOT_FILE = 'AGENTS.md';
/** Skill bundles (`<name>/SKILL.md`) plus flat path-scoped rule files (`<name>.md`). */
export const OPENHANDS_SKILLS_DIR = '.agents/skills';
export const OPENHANDS_AGENTS_DIR = '.agents/agents';
/**
 * Commands are invoked as `/<plugin>:<command>`, so the directory name is the
 * namespace users type. `load_manifest` infers the plugin name from the
 * directory; a `plugin.json` manifest is NOT required even though the docs say
 * it is, so none is written.
 */
export const OPENHANDS_PLUGIN_NAME = 'agentsmesh';
export const OPENHANDS_PLUGIN_DIR = `.agents/plugins/${OPENHANDS_PLUGIN_NAME}`;
/** Command NAME comes from the filename; a `name:` frontmatter key is ignored. */
export const OPENHANDS_COMMANDS_DIR = `${OPENHANDS_PLUGIN_DIR}/commands`;
/** Shared with goose, which reads the same open-plugin `.mcp.json`. */
export const OPENHANDS_MCP_FILE = `${OPENHANDS_PLUGIN_DIR}/.mcp.json`;

/** Hooks did NOT move to `.agents/`; `.agents/hooks.json` would be a dead file. */
export const OPENHANDS_DIR = '.openhands';
export const OPENHANDS_HOOKS_FILE = `${OPENHANDS_DIR}/hooks.json`;

// Global-level paths (relative to the home directory)
/**
 * There is no `~/AGENTS.md` tier. A trigger-less markdown file directly under
 * `~/.agents/skills/` is always injected, which is the closest global surface,
 * and `_root.md` keeps the canonical slug so the round-trip is symmetric.
 */
export const OPENHANDS_GLOBAL_ROOT_FILE = `${OPENHANDS_SKILLS_DIR}/_root.md`;

// Canonical paths
export const OPENHANDS_CANONICAL_MCP = 'mcp.json';
