/**
 * Codex CLI target constants.
 * Codex uses AGENTS.md (primary instructions), .agents/skills/ (skills),
 * .codex/skills/ (fallback skills layout), and .codex/config.toml (MCP).
 */

export const CODEX_TARGET = 'codex-cli';

/** Primary instructions file */
export const CODEX_MD = 'codex.md';

/** Shared GitHub Agents format — AGENTS.md is the primary per official docs */
export const AGENTS_MD = 'AGENTS.md';
export const CODEX_GLOBAL_AGENTS_MD = '.codex/AGENTS.md';
export const CODEX_GLOBAL_AGENTS_OVERRIDE_MD = '.codex/AGENTS.override.md';

/** Skills directory (repo-level, scanned from CWD up to repo root) */
export const CODEX_SKILLS_DIR = '.agents/skills';

/** Fallback skills directory used by some Codex skill libraries */
export const CODEX_SKILLS_FALLBACK_DIR = '.codex/skills';

/** Project-level config file (MCP servers and other overrides) */
export const CODEX_CONFIG_TOML = '.codex/config.toml';
export const CODEX_HOOKS_FILE = '.codex/hooks.json';

/** Canonical markdown mirrors for additional generated rules */
export const CODEX_INSTRUCTIONS_DIR = '.codex/instructions';

/** Starlark execution rules (`.rules`) + legacy `.md` import */
export const CODEX_RULES_DIR = '.codex/rules';

/** Project custom agents (native TOML format) */
export const CODEX_AGENTS_DIR = '.codex/agents';

export const CODEX_RULE_EMBED_MARKER = 'am-codex-rule:v1';
export const CODEX_RULE_EMBED_JSON_PREFIX = '# am-json: ';
export const CODEX_RULE_EMBED_B64_BEGIN = '# am-body-b64-begin';
export const CODEX_RULE_EMBED_B64_END = '# am-body-b64-end';
export const CODEX_RULE_EMBED_B64_LINE = '# am64:';

export const CODEX_RULE_INDEX_START = '<!-- agentsmesh:codex-rule-index:start -->';
export const CODEX_RULE_INDEX_END = '<!-- agentsmesh:codex-rule-index:end -->';

/**
 * Codex's documented hook lifecycle events (https://learn.chatgpt.com/docs/hooks).
 * Notably there is no `Notification` event — canonical `Notification` hooks are
 * dropped (with a lint warning) rather than written as an unrecognized key.
 */
export const CODEX_SUPPORTED_HOOK_EVENTS = [
  'SessionStart',
  'SubagentStart',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'UserPromptSubmit',
  'SubagentStop',
  'Stop',
] as const;

/** Dedicated `.rules` file for canonical permissions (distinct from per-rule `{slug}.rules`
 * execution-emit files, and from Codex's own `default.rules` TUI-write destination, so
 * agentsmesh never double-writes or collides with either). */
export const CODEX_PERMISSIONS_RULES_BASENAME = 'agentsmesh-permissions.rules';
