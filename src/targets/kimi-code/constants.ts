/**
 * Kimi Code CLI target constants.
 *
 * Kimi Code CLI is Moonshot AI's terminal coding agent
 * (moonshotai.github.io/kimi-code/en, npm `@moonshot-ai/kimi-code`).
 *
 *   - **Project config**: `AGENTS.md` + `.kimi-code/agents/` +
 *     `.kimi-code/skills/` + `.kimi-code/mcp.json`
 *   - **User config**: `~/.kimi-code/AGENTS.md` + `~/.kimi-code/agents/` +
 *     `~/.kimi-code/skills/` + `~/.kimi-code/mcp.json` + `~/.kimi-code/config.toml`
 *
 * Instruction files are CONCATENATED, not chosen between: `loadAgentsMdForRoots`
 * collects `~/.kimi-code/AGENTS.md`, then `~/.agents/AGENTS.md`, then per
 * directory `.kimi-code/AGENTS.md` **and** the first of `AGENTS.md`/`agents.md`,
 * and joins them all. Generation therefore writes exactly one file per scope
 * (the shared root `AGENTS.md` for a project) with non-root rules embedded in
 * it; import reads every source, and stale cleanup evicts the project
 * `.kimi-code/AGENTS.md` so the same rules cannot enter the prompt twice.
 *
 * `KIMI_CODE_HOME` caveat: the env var relocates the whole data root, so every
 * `~/.kimi-code/...` path below becomes `$KIMI_CODE_HOME/...`. agentsmesh's
 * global scope is a single home-relative path, so it emits the default location;
 * users who set `KIMI_CODE_HOME` must copy or symlink the directory.
 */

export const KIMI_CODE_TARGET = 'kimi-code';

// Project-level paths
export const KIMI_CODE_ROOT_FILE = 'AGENTS.md';
/** Second project instruction file: imported, never written, evicted when stale. */
export const KIMI_CODE_NESTED_ROOT_FILE = '.kimi-code/AGENTS.md';
export const KIMI_CODE_AGENTS_DIR = '.kimi-code/agents';
export const KIMI_CODE_SKILLS_DIR = '.kimi-code/skills';
/**
 * A real project-scope MCP file. Kimi Code resolves `~/.kimi-code/mcp.json`,
 * then `<git-root>/.mcp.json`, then `.kimi-code/mcp.json`, most specific
 * winning. agentsmesh writes only the two `.kimi-code/` files: `.mcp.json` at
 * the repo root belongs to Claude Code.
 */
export const KIMI_CODE_MCP_FILE = '.kimi-code/mcp.json';

// Global-level paths (relative to the home directory)
export const KIMI_CODE_GLOBAL_ROOT_FILE = '.kimi-code/AGENTS.md';
/**
 * Cross-tool machine-wide instructions, concatenated with the Kimi-specific
 * file. Read on import; Warp owns writing it, so this target never touches it —
 * with both targets enabled Kimi Code sees the rules twice, which is Warp's
 * path to own, not ours to delete.
 */
export const KIMI_CODE_SHARED_GLOBAL_ROOT_FILE = '.agents/AGENTS.md';
export const KIMI_CODE_GLOBAL_AGENTS_DIR = '.kimi-code/agents';
export const KIMI_CODE_GLOBAL_SKILLS_DIR = '.kimi-code/skills';
export const KIMI_CODE_GLOBAL_MCP_FILE = '.kimi-code/mcp.json';
/**
 * The single user-level settings file. It also stores provider credentials in
 * clear text under `[providers.<name>].api_key`, so generation merges the two
 * agentsmesh-owned keys (`hooks`, `permission.rules`) into whatever is on disk
 * and never rewrites the document wholesale. There is no project-level
 * `config.toml`: hooks and permissions are user-scope only.
 */
export const KIMI_CODE_GLOBAL_CONFIG_FILE = '.kimi-code/config.toml';

// Canonical paths
