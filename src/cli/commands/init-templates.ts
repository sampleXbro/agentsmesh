/**
 * Template data for agentsmesh init command.
 *
 * Every YAML file written by `init` carries the `# yaml-language-server:`
 * directive recognized by the Red Hat YAML extension (VSCode), JetBrains
 * IDEs' built-in YAML support, vim/neovim with `yaml-language-server`, and
 * the GitHub Actions YAML editor. The URL is pinned to the running package
 * version via `yamlSchemaDirective(...)` so the schema referenced always
 * matches the file format the writer used.
 */

import { starterInitTargetIds } from '../../targets/catalog/init-starter-targets.js';
import { yamlSchemaDirective } from '../../utils/output/schema-directive.js';
import { ROOT_RULE_PLACEHOLDER_BODY } from '../../canonical/root-rule-placeholder.js';

const ALL_FEATURES = [
  'rules',
  'commands',
  'agents',
  'skills',
  'mcp',
  'hooks',
  'ignore',
  'permissions',
];

/**
 * Starter targets intentionally exclude codex-cli.
 * Codex appends an AGENTS.md rule index when additional canonical rules exist,
 * which makes the out-of-the-box starter scaffold conflict with other AGENTS.md-based targets.
 * Users can opt into codex-cli by adding it to agentsmesh.yaml after init.
 */
export const DEFAULT_INIT_TARGETS = starterInitTargetIds();

/**
 * Build agentsmesh.yaml content for the given targets.
 * @param targets - Target tool IDs to include; uses the starter target set if empty
 */
export function buildConfig(
  targets: readonly string[],
  defaultTargets: readonly string[] = DEFAULT_INIT_TARGETS,
): string {
  const targetList = (targets.length > 0 ? targets : defaultTargets)
    .map((t) => `  - ${t}`)
    .join('\n');
  const featureList = ALL_FEATURES.map((f) => `  - ${f}`).join('\n');
  return `${yamlSchemaDirective('agentsmesh')}version: 1\ntargets:\n${targetList}\nfeatures:\n${featureList}\n`;
}

// ─── Canonical file templates ─────────────────────────────────────────────────

export const TEMPLATE_ROOT_RULE = `---
root: true
description: "Project rules"
---

${ROOT_RULE_PLACEHOLDER_BODY}
`;

export const TEMPLATE_EXAMPLE_RULE = `---
description: "Example contextual rule — rename and customize"
# targets: [claude-code, cursor]   # limit to specific tools (optional)
# globs: ["src/**/*.ts"]           # activate only for matching files (optional)
---

# Example Rule

Replace this with your coding standards, conventions, or domain-specific guidelines.
`;

export const TEMPLATE_EXAMPLE_COMMAND = `---
description: "Example command — rename and customize"
# allowed-tools: [Read, Grep, Glob, Bash]
---

Describe the task for this command here.
Commands are invoked on-demand (e.g. /example) with a focused tool set.
`;

export const TEMPLATE_EXAMPLE_AGENT = `---
name: example-agent
description: "Example subagent — rename and customize"
# tools: [Read, Grep, Glob]
# model: sonnet
# permissionMode: ask
# maxTurns: 10
---

Describe this agent's role and instructions here.
Agents are specialized subagents with restricted tools and a specific purpose.
`;

export const TEMPLATE_EXAMPLE_SKILL = `---
name: example-skill
description: "Example skill — rename and customize"
---

# Example Skill

Describe the skill procedure here.
Skills are reusable multi-step procedures that commands and agents can reference.
`;

export const TEMPLATE_MCP = `{
  "mcpServers": {
    // agentsmesh self-serve MCP server — exposes your canonical config to AI agents.
    // Lets agents introspect rules/commands/agents/skills and trigger generate.
    // Docs: https://samplexbro.github.io/agentsmesh/reference/mcp-server/
    // For faster startup, install agentsmesh as a devDependency and replace the entry below with:
    //   "command": "agentsmesh", "args": ["mcp"]
    // Remove this entry to disable.
    "agentsmesh": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agentsmesh", "mcp"]
    }

    // "github": {
    //   "type": "stdio",
    //   "command": "npx",
    //   "args": ["-y", "@modelcontextprotocol/server-github"],
    //   "env": { "GITHUB_TOKEN": "$GITHUB_TOKEN" }
    // },
    // "filesystem": {
    //   "type": "stdio",
    //   "command": "npx",
    //   "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allow"]
    // }
  }
}
`;

export const TEMPLATE_HOOKS = `${yamlSchemaDirective('hooks')}# Lifecycle hooks — run shell commands before/after AI tool use
# Events: PreToolUse, PostToolUse, SubagentStart, SubagentStop
# Matcher: tool name pattern (e.g. "Edit|Write", "Bash", "*")
#
# PreToolUse:
#   - matcher: Edit|Write
#     type: command
#     command: npm run lint --fix
#
# PostToolUse:
#   - matcher: Edit|Write
#     type: command
#     command: npm test --passWithNoTests
`;

// The lists are commented out, not scaffolded empty. An explicit `allow: []`
// says "grant nothing", which a target that projects permissions into a shared
// config file would apply over whatever the user already had there. Absent keys
// say "agentsmesh manages nothing here yet", which is what a fresh init means.
export const TEMPLATE_PERMISSIONS = `${yamlSchemaDirective('permissions')}# Tool permission allow/deny lists
#
# Uncomment a list to start managing it. An empty list (\`allow: []\`) is a real
# instruction — "grant nothing" — not a placeholder.
#
# allow:
#   - Bash(npm run:*)
#   - Bash(git add:*)
#   - Bash(git commit:*)
#
# deny:
#   - Bash(rm -rf:*)
#   - Bash(git push --force:*)
#
# ask:
#   - Write(/tmp/**)
`;

export const TEMPLATE_IGNORE = `# Patterns ignored by all configured AI tools (gitignore syntax)
#
# node_modules/
# dist/
# .env*
# *.log
# coverage/
`;

export const LOCAL_TEMPLATE = `${yamlSchemaDirective('agentsmesh')}# Personal overrides — NOT committed to git
# Uncomment and customize for your local setup:

# targets:
#   - claude-code
#   - continue
#   - junie
#   - cursor

# conversions:
#   commands_to_skills:
#     codex-cli: false
#   agents_to_skills:
#     windsurf: false
#
# overrides:
#   claude-code:
#     model: opus
`;
