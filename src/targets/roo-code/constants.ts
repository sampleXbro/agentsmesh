export const ROO_CODE_TARGET = 'roo-code';

// Project-level paths
export const ROO_CODE_DIR = '.roo';
export const ROO_CODE_ROOT_RULE = `${ROO_CODE_DIR}/rules/00-root.md`;
/** Flat-file fallback read during import when .roo/rules/00-root.md is absent */
export const ROO_CODE_ROOT_RULE_FALLBACK = '.roorules';
export const ROO_CODE_RULES_DIR = `${ROO_CODE_DIR}/rules`;
export const ROO_CODE_COMMANDS_DIR = `${ROO_CODE_DIR}/commands`;
export const ROO_CODE_SKILLS_DIR = `${ROO_CODE_DIR}/skills`;
export const ROO_CODE_MCP_FILE = `${ROO_CODE_DIR}/mcp.json`;
export const ROO_CODE_IGNORE = '.rooignore';

/** Project-level custom modes file (canonical agents → Roo custom modes). */
export const ROO_CODE_MODES_FILE = '.roomodes';

// Global-level paths (~/.roo/)
export const ROO_CODE_GLOBAL_DIR = '.roo';
export const ROO_CODE_GLOBAL_RULES_DIR = `${ROO_CODE_GLOBAL_DIR}/rules`;
export const ROO_CODE_GLOBAL_COMMANDS_DIR = `${ROO_CODE_GLOBAL_DIR}/commands`;
export const ROO_CODE_GLOBAL_SKILLS_DIR = `${ROO_CODE_GLOBAL_DIR}/skills`;
/**
 * `~/mcp_settings.json` — best-effort location only. Roo Code's real path is
 * `<context.globalStorageUri.fsPath>/settings/mcp_settings.json`, a per-OS/per-fork
 * VS Code extension globalStorage directory agentsmesh cannot resolve deterministically
 * (see McpHub.getMcpSettingsFilePath). Capability is 'partial', not 'native'.
 */
export const ROO_CODE_GLOBAL_MCP_FILE = 'mcp_settings.json';
/** Root rule for global scope: `~/.roo/rules/00-root.md` — Roo Code's loadRuleFiles()
 * reads `.roo/rules/` from BOTH the global `~/.roo` dir and the project dir; it never
 * reads a home-directory AGENTS.md. */
export const ROO_CODE_GLOBAL_ROOT_RULE = `${ROO_CODE_GLOBAL_RULES_DIR}/00-root.md`;
/** Legacy path a prior agentsmesh version wrote; Roo Code itself never reads this.
 * Kept as a lowest-priority import fallback only (never generated). */
export const ROO_CODE_GLOBAL_AGENTS_MD = `${ROO_CODE_GLOBAL_DIR}/AGENTS.md`;
/**
 * Global-level custom modes file. Real read path is
 * `<context.globalStorageUri.fsPath>/settings/custom_modes.yaml` (same non-deterministic
 * per-OS/per-fork VS Code globalStorage dir as MCP above) — `~/.roo/settings/custom_modes.yaml`
 * is a best-effort location, hence capability stays 'partial'.
 */
export const ROO_CODE_GLOBAL_MODES_FILE = `${ROO_CODE_GLOBAL_DIR}/settings/custom_modes.yaml`;

// Cross-agent compatibility mirror
export const ROO_CODE_GLOBAL_AGENTS_SKILLS_DIR = '.agents/skills';

/**
 * Project-scoped VS Code workspace settings. Roo Code contributes
 * `roo-cline.allowedCommands` / `roo-cline.deniedCommands` (src/package.json, no
 * `scope: application` restriction), so these ARE settable per-project here.
 * No global equivalent is wired: VS Code's user settings.json is a per-fork,
 * per-OS path outside `--global`'s single deterministic root, same as MCP above.
 */
export const ROO_CODE_VSCODE_SETTINGS = '.vscode/settings.json';
export const ROO_CODE_ALLOWED_COMMANDS_KEY = 'roo-cline.allowedCommands';
export const ROO_CODE_DENIED_COMMANDS_KEY = 'roo-cline.deniedCommands';
