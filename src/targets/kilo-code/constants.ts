/**
 * Kilo Code target constants.
 *
 * Kilo Code is a fork of Roo Code (which is a fork of Cline), now developed
 * under the "Kilo" brand (kilocode.ai redirects to kilo.ai). It supports two
 * parallel layouts simultaneously:
 *
 *   - **New** (`.kilo/...` + `AGENTS.md` + optional `kilo.jsonc`) — preferred.
 *     This is what agentsmesh GENERATES at project scope.
 *   - **Legacy** (`.kilocode/...` + `.kilocodemodes` + `.kilocodeignore`) —
 *     still loaded by the CLI / VS Code extension. agentsmesh IMPORTS from
 *     this layout for users migrating from earlier kilo or Roo-era setups.
 *
 * Global scope is documented as a SINGLE unified config file,
 * `~/.config/kilo/kilo.jsonc` (kilo.ai/docs/getting-started/settings) — not a
 * `~/.kilo/` mirror of the project layout. Root instructions
 * (`~/.config/kilo/AGENTS.md`), commands (`~/.config/kilo/commands/`), and
 * agents (`~/.config/kilo/agents/`) remain plain files
 * (kilo.ai/docs/customize/custom-instructions,
 * kilo.ai/docs/customize/workflows, kilo.ai/docs/customize/custom-subagents —
 * note custom-modes.md inconsistently shows singular `agent/` in three spots,
 * but the dedicated custom-subagents.md page states plural `agents/` in its
 * "Configuration Precedence" list, its Method 2 directory list, AND its
 * "Legacy custom_modes.yaml" migration note — treated as authoritative).
 * Additional (non-root) rules and MCP servers are documented as KEYS inside
 * `kilo.jsonc` itself (`instructions`, `mcp` — see
 * kilo.ai/docs/customize/custom-rules and
 * kilo.ai/docs/automate/mcp/using-in-kilo-code), so they are folded into that
 * shared file by `global-settings.ts` rather than written as standalone
 * files. Skills stay at `~/.kilo/skills/` at global scope — that path IS
 * documented (kilo.ai/docs/customize/skills) and is unaffected by the
 * `~/.config/kilo/` migration. There is no documented global `.kilocodeignore`
 * equivalent (kilo.ai/docs/customize/context/kilocodeignore describes it as
 * workspace-root-only), so ignore is 'none' at global scope.
 *
 * Hooks are partially supported via the auto-loaded plugin directory
 * (kilo.ai/docs/automate/extending/plugins, `.kilo/plugin/*.{ts,js}`);
 * agentsmesh does not generate plugin files, so a lint warning surfaces the gap.
 * Permissions are projected into `kilo.jsonc` via the `permission` key.
 */

export const KILO_CODE_TARGET = 'kilo-code';

/** Project-level permissions config file. */
export const KILO_CONFIG_FILE = 'kilo.jsonc';

// Project-level paths — new layout (generated)
export const KILO_CODE_DIR = '.kilo';
export const KILO_CODE_ROOT_RULE = 'AGENTS.md';
export const KILO_CODE_RULES_DIR = `${KILO_CODE_DIR}/rules`;
export const KILO_CODE_COMMANDS_DIR = `${KILO_CODE_DIR}/commands`;
export const KILO_CODE_AGENTS_DIR = `${KILO_CODE_DIR}/agents`;
export const KILO_CODE_SKILLS_DIR = `${KILO_CODE_DIR}/skills`;
export const KILO_CODE_MCP_FILE = `${KILO_CODE_DIR}/mcp.json`;

/** Legacy ignore filename — still the only natively-loaded ignore file in kilo. */
export const KILO_CODE_IGNORE = '.kilocodeignore';

// Project-level paths — legacy layout (imported, never generated)
export const KILO_CODE_LEGACY_DIR = '.kilocode';
export const KILO_CODE_LEGACY_RULES_DIR = `${KILO_CODE_LEGACY_DIR}/rules`;
export const KILO_CODE_LEGACY_WORKFLOWS_DIR = `${KILO_CODE_LEGACY_DIR}/workflows`;
export const KILO_CODE_LEGACY_SKILLS_DIR = `${KILO_CODE_LEGACY_DIR}/skills`;
export const KILO_CODE_LEGACY_MCP_FILE = `${KILO_CODE_LEGACY_DIR}/mcp.json`;
export const KILO_CODE_LEGACY_MODES_FILE = '.kilocodemodes';

// Global-level paths — unified config dir (~/.config/kilo/).
export const KILO_CODE_GLOBAL_CONFIG_DIR = '.config/kilo';
/** Global config file — rules (`instructions`), MCP (`mcp`), and permissions
 * (`permission`) are all keys inside this ONE file at global scope. */
export const KILO_GLOBAL_CONFIG_FILE = `${KILO_CODE_GLOBAL_CONFIG_DIR}/kilo.jsonc`;
export const KILO_CODE_GLOBAL_AGENTS_MD = `${KILO_CODE_GLOBAL_CONFIG_DIR}/AGENTS.md`;
export const KILO_CODE_GLOBAL_RULES_DIR = `${KILO_CODE_GLOBAL_CONFIG_DIR}/rules`;
export const KILO_CODE_GLOBAL_COMMANDS_DIR = `${KILO_CODE_GLOBAL_CONFIG_DIR}/commands`;
export const KILO_CODE_GLOBAL_AGENTS_DIR = `${KILO_CODE_GLOBAL_CONFIG_DIR}/agents`;

// Global skills stay under ~/.kilo/ (documented separately from ~/.config/kilo/).
export const KILO_CODE_GLOBAL_SKILLS_DIR = '.kilo/skills';

/** Cross-agent compatibility mirror for skills (suppressed when codex-cli is active). */
export const KILO_CODE_GLOBAL_AGENTS_SKILLS_DIR = '.agents/skills';

// Canonical paths
