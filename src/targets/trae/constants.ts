/**
 * Trae target constants.
 *
 * Trae is a ByteDance AI-powered IDE (VSCode-based). Config lives under `.trae/`.
 * Docs: https://docs.trae.ai/ide/rules
 *       https://docs.trae.ai/ide/model-context-protocol
 */

export const TRAE_TARGET = 'trae';

// Project-level paths (under project root)
export const TRAE_DIR = '.trae';
export const TRAE_RULES_DIR = `${TRAE_DIR}/rules`;

/** Primary project rules file — Trae creates this via UI "Create project_rules.md". */
export const TRAE_PROJECT_RULES = `${TRAE_RULES_DIR}/project_rules.md`;

/** Additional rules files in the .trae/rules/ directory */
export const TRAE_SKILLS_DIR = `${TRAE_DIR}/skills`;

/** MCP config at the project level */
export const TRAE_MCP_FILE = `${TRAE_DIR}/mcp.json`;

/** Ignore file: .trae/.ignore excludes paths from AI indexing */
export const TRAE_IGNORE = `${TRAE_DIR}/.ignore`;

export const TRAE_GLOBAL_RULES_DIR = '.trae/user_rules';
export const TRAE_GLOBAL_ROOT_RULE = '.trae/user_rules/rules.md';
export const TRAE_GLOBAL_SKILLS_DIR = '.trae/skills';
export const TRAE_GLOBAL_MCP_FILE = '.trae/mcp.json';

// Compatibility mirror path for skills
export const TRAE_GLOBAL_AGENTS_SKILLS_DIR = '.agents/skills';

export const TRAE_AGENTS_DIR = `${TRAE_DIR}/agents`;
export const TRAE_COMMANDS_DIR = `${TRAE_DIR}/commands`;
export const TRAE_GLOBAL_AGENTS_DIR = '.trae-cn/agents';
export const TRAE_GLOBAL_COMMANDS_DIR = '.trae/commands'; // same path, relative to home in global mode

/**
 * Global permission config: `~/.trae/permission/global.json`. Trae keeps every
 * permission rule here — including per-workspace paths, written with the
 * `$WORKSPACE_FOLDER` variable — so there is no project-level counterpart.
 * Docs: https://docs.trae.ai/ide/permission-and-approval
 *
 * The CN edition documents a different path — `~/.trae-cn/permission/work/global.json`
 * (docs.trae.cn/work_permission-and-approval), with a `work` segment naming the
 * task type — so it is not the same file under a different prefix and is not
 * mirrored here. The international path above is the one the capability ledger
 * records and verifies.
 */
export const TRAE_GLOBAL_PERMISSIONS_FILE = `${TRAE_DIR}/permission/global.json`;

/** Project-level hooks config: $PROJECT/.trae/hooks.json */
export const TRAE_HOOKS_FILE = `${TRAE_DIR}/hooks.json`;
/** Global hooks config (macOS/Linux): ~/.trae-cn/hooks.json */
export const TRAE_GLOBAL_HOOKS_FILE = '.trae-cn/hooks.json';

// Canonical paths (reference only)
