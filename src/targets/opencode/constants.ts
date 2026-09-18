/**
 * OpenCode target constants.
 *
 * OpenCode is an open-source AI coding agent (CLI/TUI) at opencode.ai.
 *
 *   - **Project config**: `.opencode/` + `opencode.json` at project root + `AGENTS.md`
 *   - **Global config**: `~/.config/opencode/` + `opencode.json`
 *
 * OpenCode natively supports commands, agents, and skills in `.opencode/`.
 * OpenCode does NOT auto-load any rules directory (opencode.ai/docs/rules):
 * only `AGENTS.md`/`CLAUDE.md` auto-discover via directory traversal. So
 * additional rules are generated to `.opencode/rules/<slug>.md` AND declared
 * in the `instructions` array of `opencode.json` (a glob pointing at that
 * dir), or they are invisible to OpenCode.
 *
 * MCP is configured in `opencode.json` under the `mcp` key.
 * Hooks are plugin-based (TypeScript/JavaScript), not config-based.
 * Permissions and ignore both live in `opencode.json` under the `permission`
 * key: canonical permissions become blanket tool actions, canonical ignore
 * becomes `read`/`edit` path deny rules (see `ignore-map.ts`).
 */

export const OPENCODE_TARGET = 'opencode';

// Project-level paths
export const OPENCODE_DIR = '.opencode';
export const OPENCODE_ROOT_RULE = 'AGENTS.md';
export const OPENCODE_RULES_DIR = `${OPENCODE_DIR}/rules`;
export const OPENCODE_COMMANDS_DIR = `${OPENCODE_DIR}/commands`;
export const OPENCODE_AGENTS_DIR = `${OPENCODE_DIR}/agents`;
export const OPENCODE_SKILLS_DIR = `${OPENCODE_DIR}/skills`;
export const OPENCODE_CONFIG_FILE = 'opencode.json';

// Global-level paths (~/.config/opencode/)
export const OPENCODE_GLOBAL_DIR = '.config/opencode';
export const OPENCODE_GLOBAL_AGENTS_MD = `${OPENCODE_GLOBAL_DIR}/AGENTS.md`;
export const OPENCODE_GLOBAL_RULES_DIR = `${OPENCODE_GLOBAL_DIR}/rules`;
export const OPENCODE_GLOBAL_COMMANDS_DIR = `${OPENCODE_GLOBAL_DIR}/commands`;
export const OPENCODE_GLOBAL_AGENTS_DIR = `${OPENCODE_GLOBAL_DIR}/agents`;
export const OPENCODE_GLOBAL_SKILLS_DIR = `${OPENCODE_GLOBAL_DIR}/skills`;
export const OPENCODE_GLOBAL_CONFIG_FILE = `${OPENCODE_GLOBAL_DIR}/opencode.json`;

/** Cross-agent compatibility mirror for skills. */
export const OPENCODE_GLOBAL_AGENTS_SKILLS_DIR = '.agents/skills';

/**
 * `instructions` glob entries for `opencode.json`'s `instructions` array —
 * this is what actually makes `.opencode/rules/*.md` load (see module doc).
 * Project-relative globs resolve via `globUp` from the project root; the
 * global entry uses an explicit `~/` prefix so OpenCode resolves it as an
 * absolute path regardless of the current project directory
 * (`Instruction.systemPaths` in opencode's own source: a `~/`-prefixed entry
 * is joined against the user's home dir and glob'd directly).
 */
export const OPENCODE_RULES_INSTRUCTIONS_GLOB = `${OPENCODE_RULES_DIR}/*.md`;
export const OPENCODE_GLOBAL_RULES_INSTRUCTIONS_GLOB = `~/${OPENCODE_GLOBAL_RULES_DIR}/*.md`;

// Canonical paths
