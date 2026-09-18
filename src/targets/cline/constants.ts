/**
 * Cline target constants.
 *
 * Paths follow the standalone Cline CLI's documented layout
 * (https://docs.cline.bot/cli/cli-reference), not the VS Code extension's
 * IDE-era paths:
 *   project: .cline/rules/, .cline/hooks/, .cline/skills/, .cline/mcp.json,
 *            .cline/agents.yaml, .clineignore (project-only)
 *   global:  ~/.cline/data/settings/rules/, ~/.cline/hooks (same relative
 *            path as project — the CLI resolves it against $HOME instead of
 *            the project root), ~/.cline/data/settings/skills/
 * Commands (workflows) are not covered by the CLI reference and keep the
 * pre-existing `.clinerules/workflows` IDE-era path unchanged.
 */

export const CLINE_TARGET = 'cline';

/** Rules directory (project) — CLI docs: `.cline/rules/` */
export const CLINE_RULES_DIR = '.cline/rules';

/** Ignore file path — project-only; no documented global equivalent (docs.cline.bot/customization/clineignore) */
export const CLINE_IGNORE = '.clineignore';

/** MCP settings — CLI docs: `.cline/mcp.json` (project-only; no documented global MCP surface) */
export const CLINE_MCP_SETTINGS = '.cline/mcp.json';
/** Legacy filenames accepted on import for backward compatibility. */
export const CLINE_MCP_SETTINGS_LEGACY = '.cline/mcp_settings.json';
export const CLINE_MCP_SETTINGS_LEGACY_AGENTSMESH = '.cline/cline_mcp_settings.json';

/** Skills directory (project) — CLI docs: `.cline/skills/` */
export const CLINE_SKILLS_DIR = '.cline/skills';
/** Skills directory (global) — CLI docs: `~/.cline/data/settings/skills/` */
export const CLINE_GLOBAL_SKILLS_DIR = '.cline/data/settings/skills';

/** Agents file — combined YAML (CLI-documented surface: docs.cline.bot/cli/cli-reference) */
export const CLINE_AGENTS_FILE = '.cline/agents.yaml';
/** @deprecated Per-agent `.md` directory; kept for backward-compatible import fallback. */
export const CLINE_AGENTS_DIR = '.cline/agents';

/** Workflows directory (.clinerules/workflows/*.md → canonical commands) — not covered by CLI docs, unchanged */
export const CLINE_WORKFLOWS_DIR = '.clinerules/workflows';

/** Root compatibility file (Cline cross-tool; same content as root rule) */
export const CLINE_AGENTS_MD = 'AGENTS.md';

/**
 * Hooks directory — CLI docs: `.cline/hooks/` (project) and `~/.cline/hooks`
 * (global, also configurable via `--hooks-dir`/`CLINE_HOOKS_DIR`). Both
 * scopes resolve to the same relative path against their respective roots.
 */
export const CLINE_HOOKS_DIR = '.cline/hooks';

/** Global rules directory — CLI docs: `~/.cline/data/settings/rules/` */
export const CLINE_GLOBAL_RULES_DIR = '.cline/data/settings/rules';
/** Global workflows directory — not covered by CLI docs, unchanged (IDE-era path) */
export const CLINE_GLOBAL_WORKFLOWS_DIR = 'Documents/Cline/Workflows';
