import type { Hooks } from './hook-types.js';
import type { McpConfig } from './mcp-types.js';

/** A parsed rule from .agentsmesh/rules/ (glob: *.md) */
export interface CanonicalRule {
  /** Source file path (for error reporting) */
  source: string;
  /** If true, this is the root/always-applied rule */
  root: boolean;
  /** Which targets receive this rule. Empty = all */
  targets: string[];
  /** Human description for AI context */
  description: string;
  /** Glob patterns for file scoping */
  globs: string[];
  /** Markdown body content */
  body: string;
  /** Activation mode hint for tools that support it (e.g. Windsurf) */
  trigger?: 'always_on' | 'model_decision' | 'glob' | 'manual';
  /**
   * Codex CLI: `advisory` (default) → nested `AGENTS.md` / `AGENTS.override.md`.
   * `execution` → `.codex/rules/{slug}.rules` body must be Starlark (`prefix_rule`, …).
   * @see docs/agent-structures/codex-cli-project-level-advanced.md §6.2, §6.10
   */
  codexEmit?: 'advisory' | 'execution';
  /**
   * Codex nested instruction filename: `override` → `AGENTS.override.md` (advisory only).
   */
  codexInstructionVariant?: 'default' | 'override';
}

/** A parsed command from .agentsmesh/commands/ (glob: *.md) */
export interface CanonicalCommand {
  source: string;
  /** Command name (derived from filename) */
  name: string;
  description: string;
  /** Tool permissions: ["Read", "Grep", "Bash(git diff)"] */
  allowedTools: string[];
  /** When true, also emit ~/.claude/output-styles/{name}.md in Claude global mode */
  outputStyle?: boolean;
  body: string;
}

/** A parsed subagent from .agentsmesh/agents/ (glob: *.md) */
export interface CanonicalAgent {
  source: string;
  name: string;
  description: string;
  /** Tools this agent can use */
  tools: string[];
  /** Tools explicitly denied */
  disallowedTools: string[];
  /** AI model preference */
  model: string;
  /** Permission mode */
  permissionMode: string;
  /** Max conversation turns */
  maxTurns: number;
  /** MCP servers available to this agent */
  mcpServers: string[];
  /** Hooks specific to this agent */
  hooks: Hooks;
  /** Skills available to this agent */
  skills: string[];
  /** Memory file path */
  memory: string;
  /** System prompt (markdown body) */
  body: string;
  /** When true, also emit ~/.claude/output-styles/{name}.md in Claude global mode */
  outputStyle?: boolean;
}

/** Supporting file for a skill */
export interface SkillSupportingFile {
  relativePath: string;
  absolutePath: string;
  /** File content (utf-8) for generation; empty if unreadable */
  content: string;
}

/** A parsed skill from .agentsmesh/skills/{name}/SKILL.md */
export interface CanonicalSkill {
  source: string;
  /** Skill name (derived from directory name) */
  name: string;
  description: string;
  /** SKILL.md content */
  body: string;
  /** Paths to supporting files (relative to skill dir) */
  supportingFiles: SkillSupportingFile[];
}

/**
 * Permission allow/deny/ask lists. A missing list is unmanaged: generate leaves
 * the tool's own list alone. An empty list is managed and means "none".
 */
export interface Permissions {
  allow?: string[];
  deny?: string[];
  ask?: string[];
}

/** Ignore patterns (gitignore syntax lines) */
export type IgnorePatterns = string[];

/** All canonical files loaded from .agentsmesh/ */
export interface CanonicalFiles {
  rules: CanonicalRule[];
  commands: CanonicalCommand[];
  agents: CanonicalAgent[];
  skills: CanonicalSkill[];
  mcp: McpConfig | null;
  permissions: Permissions | null;
  hooks: Hooks | null;
  ignore: IgnorePatterns;
}
