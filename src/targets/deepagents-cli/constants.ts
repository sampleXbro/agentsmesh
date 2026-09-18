/**
 * Deep Agents CLI target constants.
 *
 * Deep Agents CLI is a coding agent by LangChain, built on LangGraph.
 *
 *   - **Project config**: `.deepagents/AGENTS.md` + `.deepagents/skills/` +
 *     `.deepagents/agents/` + `.mcp.json`
 *   - **Global config**: `~/.deepagents/{agent}/` (AGENTS.md, skills/, agents/,
 *     per agent-instance, default agent name `"agent"`) + flat `~/.deepagents/`
 *     (.mcp.json, hooks.json — NOT per-agent scoped)
 *
 * Deep Agents reads both `.deepagents/AGENTS.md` and root `AGENTS.md` for
 * project instructions (combining them, with `.deepagents/AGENTS.md` first).
 * We generate to `.deepagents/AGENTS.md` to avoid collision with Amp/Codex/Warp
 * which also use root `AGENTS.md`.
 *
 * Verified against docs.langchain.com/oss/javascript/deepagents/code/configuration
 * (#data-locations): global instructions/skills/subagents live under a
 * per-agent-instance directory `~/.deepagents/{agent}/`, NOT a flat
 * `~/.deepagents/` root — the default agent instance name is `"agent"`. MCP
 * (`.mcp.json`) and hooks (`hooks.json`) are the only flat, unscoped globals.
 *
 * Subagents are a dedicated on-disk surface, distinct from skills:
 * `.deepagents/agents/{name}/AGENTS.md` (project) and
 * `~/.deepagents/{agent}/agents/{name}/AGENTS.md` (global).
 */

export const DEEPAGENTS_CLI_TARGET = 'deepagents-cli';

/** Default per-agent-instance directory segment used for global-scope paths. */
export const DEEPAGENTS_CLI_DEFAULT_AGENT_NAME = 'agent';

// Project-level paths
export const DEEPAGENTS_CLI_ROOT_FILE = '.deepagents/AGENTS.md';
export const DEEPAGENTS_CLI_SKILLS_DIR = '.deepagents/skills';
export const DEEPAGENTS_CLI_AGENTS_DIR = '.deepagents/agents';
export const DEEPAGENTS_CLI_MCP_FILE = '.mcp.json';

// Global-level paths — scoped under the per-agent-instance directory, except
// for the flat, unscoped `.mcp.json` / `hooks.json`.
export const DEEPAGENTS_CLI_GLOBAL_ROOT_FILE = `.deepagents/${DEEPAGENTS_CLI_DEFAULT_AGENT_NAME}/AGENTS.md`;
export const DEEPAGENTS_CLI_GLOBAL_SKILLS_DIR = `.deepagents/${DEEPAGENTS_CLI_DEFAULT_AGENT_NAME}/skills`;
export const DEEPAGENTS_CLI_GLOBAL_AGENTS_DIR = `.deepagents/${DEEPAGENTS_CLI_DEFAULT_AGENT_NAME}/agents`;
export const DEEPAGENTS_CLI_GLOBAL_MCP_FILE = '.deepagents/.mcp.json';
export const DEEPAGENTS_CLI_GLOBAL_HOOKS_FILE = '.deepagents/hooks.json';

/**
 * General user config (`config_manifest.py`): credentials, model, display state
 * — and the only permission surface, `shell.allow_list` + `startup.mode`.
 * Global-only and NOT agentsmesh-owned, so it stays out of managedOutputs.
 */
export const DEEPAGENTS_CLI_GLOBAL_CONFIG_FILE = '.deepagents/config.toml';

// Canonical paths
