/**
 * Amazon Q Developer target constants.
 *
 * Amazon Q Developer is AWS's AI coding assistant with rules-based customization.
 *
 *   - **Project rules dir**: `.amazonq/rules/*.md` — directory of Markdown rule files
 *   - **Project MCP config**: `.amazonq/mcp.json`
 *   - **Global config dir**: `~/.aws/amazonq/` (user-home AWS config)
 *   - **Global rules dir**: `.aws/amazonq/rules/*.md` (relative to home dir)
 *   - **Global MCP config**: `.aws/amazonq/mcp.json` (relative to home dir)
 *
 * No skills support and no ignore file anywhere. Hooks, permissions (allow), ignore
 * (`toolsSettings` deniedPaths) and the global rules pointer (`resources`) are all
 * embedded inside each generated agent JSON.
 *
 * Q CLI has no global rules path: `paths.rs` `mod global` lists agents, prompts, MCP,
 * checkouts, bash history, legacy global context, profiles and knowledge bases — no
 * rules constant. The single rules glob, `workspace::RULES_PATTERN`, is cwd-relative
 * and is injected into the built-in default agent's `resources`. So `.aws/amazonq/rules`
 * is only read when a generated agent points at it via `resources`.
 *
 * Reference:
 *   https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-project-rules.html
 *   https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-understanding-config.html
 *   https://github.com/aws/amazon-q-developer-cli/blob/main/crates/chat-cli/src/util/paths.rs
 *   https://github.com/aws/amazon-q-developer-cli/blob/main/docs/built-in-tools.md
 */

export const AMAZON_Q_TARGET = 'amazon-q';

export const AMAZON_Q_RULES_DIR = '.amazonq/rules';
export const AMAZON_Q_MCP_FILE = '.amazonq/mcp.json';
export const AMAZON_Q_AGENTS_DIR = '.amazonq/cli-agents';
/** `/prompts` reads flat `<name>.md` files from here (paths.rs `workspace::PROMPTS_DIR`). */
export const AMAZON_Q_PROMPTS_DIR = '.amazonq/prompts';

export const AMAZON_Q_GLOBAL_RULES_DIR = '.aws/amazonq/rules';
export const AMAZON_Q_GLOBAL_MCP_FILE = '.aws/amazonq/mcp.json';
export const AMAZON_Q_GLOBAL_AGENTS_DIR = '.aws/amazonq/cli-agents';
/** paths.rs `global::PROMPTS_DIR`; a local prompt of the same name wins. */
export const AMAZON_Q_GLOBAL_PROMPTS_DIR = '.aws/amazonq/prompts';

/**
 * Agent `resources` entry for project rules — the same cwd-relative glob Q injects
 * into its built-in default agent (`paths.rs` `workspace::RULES_PATTERN`). Custom
 * agents deserialize `resources` with `#[serde(default)]`, so they inherit nothing
 * and need this written explicitly.
 */
export const AMAZON_Q_PROJECT_RULES_RESOURCE = 'file://.amazonq/rules/**/*.md';
/** Agent `resources` entry for global rules; `~` is expanded by `canonicalize_path_sys`. */
export const AMAZON_Q_GLOBAL_RULES_RESOURCE = 'file://~/.aws/amazonq/rules/**/*.md';

/**
 * Documentation files the built-in default agent always exposes
 * (`paths.rs` `workspace::DEFAULT_AGENT_RESOURCES`, prepended to the rules glob by
 * `Agent::default()`). A custom agent inherits none of them, so full parity means
 * writing them out; otherwise a generated agent cannot read the `AGENTS.md`
 * agentsmesh itself produces for other targets.
 */
export const AMAZON_Q_DEFAULT_AGENT_RESOURCES = [
  'file://AmazonQ.md',
  'file://AGENTS.md',
  'file://README.md',
] as const;

// Canonical paths
