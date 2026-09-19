<div align="center">

# AgentsMesh

### One config for every AI coding tool, with a shared memory that learns from your repo.

<img src="https://raw.githubusercontent.com/sampleXbro/agentsmesh/master/assets/agentsmesh-banner.jpeg" alt="AgentsMesh: one source, every AI coding tool, agents that learn" width="100%" />

[![CI](https://github.com/sampleXbro/agentsmesh/actions/workflows/ci.yml/badge.svg)](https://github.com/sampleXbro/agentsmesh/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/agentsmesh.svg)](https://www.npmjs.com/package/agentsmesh)
[![npm downloads](https://img.shields.io/npm/dm/agentsmesh.svg)](https://www.npmjs.com/package/agentsmesh)
[![Coverage](https://codecov.io/gh/sampleXbro/agentsmesh/branch/master/graph/badge.svg)](https://codecov.io/gh/sampleXbro/agentsmesh)
[![Node.js](https://img.shields.io/node/v/agentsmesh.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-website-brightgreen.svg)](https://samplexbro.github.io/agentsmesh/)

</div>

Every AI coding assistant reads its own config: `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.gemini/settings.json`, and more. Keeping rules, prompts, MCP servers, hooks, and permissions the same across Claude Code, Cursor, GitHub Copilot, Gemini CLI, Codex CLI, and the rest by hand does not scale, and the copies drift.

**AgentsMesh makes `.agentsmesh/` the one source.** Write rules, commands, agents, skills, MCP servers, hooks, ignore patterns, and permissions once. `agentsmesh generate` writes every tool's native files, `agentsmesh import` pulls existing configs back in without loss, and `agentsmesh check` fails CI when anything drifts.

**Your agents learn from your repo.** [Lessons](#teach-your-agents-lessons) give every agent, in every tool, one git-tracked memory: capture a rule after a failure, recall it before the next edit. Same mistake, never twice.

> [!NOTE]
> Full documentation, guides, and the per-tool reference: **[samplexbro.github.io/agentsmesh](https://samplexbro.github.io/agentsmesh/)**

## Install

Every method ships the same CLI (`agentsmesh`, alias `amsh`). The npm package also exposes the [TypeScript API](https://samplexbro.github.io/agentsmesh/reference/programmatic-api/).

```bash
# Homebrew (macOS / Linux), no Node.js required
brew install samplexbro/agentsmesh/agentsmesh

# Standalone binary (Linux / macOS), no Node.js required
# Windows: download agentsmesh-windows-x64.exe from GitHub Releases
curl -fsSL https://github.com/sampleXbro/agentsmesh/releases/latest/download/install.sh | sh

# npm / pnpm / yarn, requires Node.js 20+
npm install -g agentsmesh     # or: pnpm add -g agentsmesh / yarn global add agentsmesh
npm install -D agentsmesh     # pin per repo as a dev dependency, then run with npx
```

Binaries with SHA-256 checksums are on [GitHub Releases](https://github.com/sampleXbro/agentsmesh/releases/latest).

## 60-second quickstart

```bash
agentsmesh init       # detect the tools you use, import their configs, or scaffold fresh
agentsmesh generate   # write each tool's native config from the one source
agentsmesh check      # CI drift gate against .agentsmesh/.lock
```

On a terminal, `init` runs a short wizard: pick targets, import detected configs (`.cursor/`, `.claude/`, `.github/copilot-instructions.md`, and more), enable lessons, and optionally generate right away. Nothing is written until you finish. Use `--yes` for the non-interactive default, `--global` for your user-level config under `~/.agentsmesh/`, and `npx agentsmesh` if you installed it as a dev dependency.

`init` enables the tools you actually use, not all of them: whatever this project already has config for, else whatever is installed on your machine, else a minimal set of Claude Code, Cursor and Copilot. It prints what it picked. Pass `--targets a,b` to choose, or `--all-targets` for everything.

> [!TIP]
> Commit both `.agentsmesh/` and the generated tool files, like a lockfile: the tools read the generated files directly, and `agentsmesh check` keeps the two from drifting.

## Before / After

```text
# Before: one copy of the same intent per tool
CLAUDE.md
AGENTS.md
.cursor/rules/*.mdc
.github/copilot-instructions.md
.gemini/settings.json
.windsurf/rules/*.md
.codex/config.toml
.kiro/steering/*.md
```

```text
# After: one canonical source, generated everywhere
.agentsmesh/
  rules/_root.md      # the root rule every tool projects
  commands/           # reusable slash-style prompts
  agents/             # agent definitions
  skills/             # composable skills with supporting files
  mcp.json            # MCP server definitions
  hooks.yaml          # pre/post tool hooks
  permissions.yaml    # allow/deny rules
  ignore              # paths the assistant must not touch
  lessons/            # optional shared agent memory
```

`agentsmesh.yaml` selects targets and features, `agentsmesh.local.yaml` holds per-developer overrides (gitignored), and `.agentsmesh/.lock` records the checksums that `check` enforces. Cross-file links are rewritten to each tool's own paths on the way out.

<div align="center">
  <img src="https://raw.githubusercontent.com/sampleXbro/agentsmesh/master/assets/generate-demo.gif" alt="agentsmesh detects existing tool configs, imports them into one source, and generates native config for every tool" width="100%" />
</div>

## Teach your agents: lessons

No other config-sync tool has this. Lessons are a memory of past mistakes that every agent reads before it acts and writes after something goes wrong, so a lesson one agent learns today helps every teammate's agent tomorrow, in any tool.

<div align="center">
  <img src="https://raw.githubusercontent.com/sampleXbro/agentsmesh/master/assets/lessons-demo.gif" alt="an AI agent captures a lesson after a failure, then recalls it before editing the same file" width="100%" />
</div>

The memory is one git-tracked file, `.agentsmesh/lessons/lessons.json`, driven by two commands:

```bash
# After a failure, the agent writes the rule down with a trigger:
agentsmesh lessons add "Normalize CLI display paths to forward slashes" \
  --topic windows-paths --trigger-file "src/cli/**/*.ts"

# Before the next edit, any agent in any tool recalls it:
agentsmesh lessons query --file src/cli/output.ts --session auto
# -> "Normalize CLI display paths to forward slashes"
```

`agentsmesh init --lessons` wires the loop once: an always-on rule in `_root.md`, a `lessons` skill where supported, recall and capture hooks on hook-capable tools, and matching MCP tools (`lessons_query`, `lessons_add`) for agents without shell access. Rules can be scoped by file, command, or keyword, or always-on with `--scope always`.

Full walkthrough: [Teach your AI agents with lessons](https://samplexbro.github.io/agentsmesh/guides/lessons/) · [`agentsmesh lessons` reference](https://samplexbro.github.io/agentsmesh/cli/lessons/)

## How AgentsMesh compares

[Ruler](https://github.com/intellectronica/ruler) and [rulesync](https://github.com/dyoshikawa/rulesync) both cover the common ground well, and rulesync supports more tools than AgentsMesh does. What is left to differentiate is what survives translation: links rewritten per target, a round-trip that loses nothing, a lockfile-backed drift gate, new tools addable without a core release, and a memory that learns.

| Capability | AgentsMesh | Ruler | rulesync |
|---|:---:|:---:|:---:|
| Generate native config for many tools | ✅ | ✅ | ✅ |
| Tools supported (counted from source) | 33 | ~31 | ~50 |
| Import existing tool config back to source | ✅ | — | ✅ |
| Convert one tool's config directly to another | ✅ | — | ✅ |
| CI drift gate (non-zero exit on drift) | ✅ | partial | ✅ |
| Lint before a target silently drops content | ✅ | partial | partial |
| Self-serve MCP server (agent-operable config) | ✅ | — | ✅ |
| `--json` output + typed programmatic API | ✅ | — | ✅ |
| **Lossless round-trip** (re-import restores originals) | ✅ | — | partial |
| **Cross-file links rewritten per target** | ✅ | — | — |
| **Lockfile-verified drift + git-merge recovery** | ✅ | — | — |
| **Target plugins: add a tool without a core release** | ✅ | — | — |
| **Lessons: a shared agent memory that learns** | ✅ | — | — |

<sub>Verified against each project's source and docs on 2026-09-19. Tool counts are counted from source, not marketing claims, and differ by how variants are tallied. Two newer projects solve adjacent problems rather than this one: [capa](https://github.com/infragate/capa) is a package manager and MCP gateway, and [Sentry's dotagents](https://github.com/getsentry/dotagents) manages skill and MCP dependencies without emitting instruction files. Detail and sources in the [alternatives guide](https://samplexbro.github.io/agentsmesh/reference/alternatives/); corrections welcome.</sub>

Built to be depended on: 12,000+ tests on Linux, macOS, and Windows CI, JSON-Schema-validated configs, npm releases with [provenance](https://docs.npmjs.com/generating-provenance-statements), and a per-file coverage floor in the test gate.

## Highlights

- **Lossless two-way sync.** When a tool has no native slot for a feature, it is embedded with round-trip metadata instead of dropped. [Managed embedding](https://samplexbro.github.io/agentsmesh/reference/managed-embedding/)
- **Automatic link rebasing.** `.agentsmesh/skills/api-gen/template.hbs` becomes `.claude/skills/...` or `.cursor/skills/...` in each generated file. [Generation pipeline](https://samplexbro.github.io/agentsmesh/reference/generation-pipeline/)
- **Safe adoption.** `import`, then `diff`, then `generate`, then `check`; nothing is overwritten blind. When several tools have a root rule, they are merged into one `_root.md` rather than the last one winning. [Existing-project guide](https://samplexbro.github.io/agentsmesh/guides/existing-project/)
- **Output directory safety.** `generate` and `convert` reject output directories that resolve outside the project (or home directory with `--global`), checked before any write and under `--dry-run` too. Stale-file cleanup enforces the same boundary.
- **Safe updates.** Explicitly empty Claude permission, hook, and MCP configurations clear their generated entries. MCP edits preserve untouched server fields and reject malformed files; skill updates validate supporting files before writing.
- **Migrate between tools.** `convert --from <a> --to <b>` rewrites one tool's config directly into another's. [convert](https://samplexbro.github.io/agentsmesh/cli/convert/)
- **Global mode.** `~/.agentsmesh/` syncs personal config to `~/.claude/`, `~/.cursor/`, `~/.codex/`, and more; config commands accept `--global`. [Global paths](https://samplexbro.github.io/agentsmesh/reference/supported-tools/#global-mode)
- **CI-ready.** `check` gates drift, `diff` previews, `merge` rebuilds the lock after a Git conflict, and `lint` warns about content a tool would mishandle. [check](https://samplexbro.github.io/agentsmesh/cli/check/) · [lint](https://samplexbro.github.io/agentsmesh/cli/lint/)
- **Community packs and `extends`.** Install rules, skills, agents, and commands from any git repo; hooks, permissions, and MCP from remote sources stay off until you opt in. [install](https://samplexbro.github.io/agentsmesh/cli/install/)
- **Target plugins.** Ship a new tool as an npm package with full parity to built-in targets. [Build a plugin](https://samplexbro.github.io/agentsmesh/guides/building-plugins/)
- **Schema-validated configs.** Every config ships a JSON Schema for editor autocomplete. [JSON schemas](https://samplexbro.github.io/agentsmesh/reference/json-schemas/)
- **Scriptable.** A typed API for `generate`, `import`, `lint`, `diff`, and `check`, `--json` envelopes on every command except `watch`, and an MCP server so agents can operate the config themselves. [API](https://samplexbro.github.io/agentsmesh/reference/programmatic-api/) · [MCP server](https://samplexbro.github.io/agentsmesh/reference/mcp-server/)

## Commands

| Command | What it does |
|---|---|
| `init` | Scaffold `.agentsmesh/` and config (interactive wizard on a TTY) |
| `generate` | Write native config for every enabled tool |
| `check` | Fail when generated files drift from `.agentsmesh/.lock` (CI gate) |
| `diff` | Preview what the next `generate` would change |
| `import` | Pull an existing tool's config into `.agentsmesh/` |
| `convert` | Convert one tool's config directly into another's |
| `lint` | Validate canonical config against target constraints |
| `watch` | Regenerate target files on save |
| `merge` | Rebuild `.agentsmesh/.lock` after a Git merge conflict |
| `matrix` | Print the feature and target support matrix |
| `install` · `uninstall` · `installs` | Add, remove, and list community packs |
| `refresh` | Re-fetch installed packs from their sources |
| `plugin` | Add, list, or remove plugin-provided targets |
| `target` | Scaffold a new target's source skeleton (for contributors) |
| `lessons` | Query and capture agent memory |
| `mcp` | Start the AgentsMesh MCP server (stdio) |

Run `agentsmesh <command> --help` for flags, or see the [CLI reference](https://samplexbro.github.io/agentsmesh/cli/).

## Supported tools

AgentsMesh generates native config for every major AI coding assistant, plus plugin targets. Native, embedded, and partial support per feature is tracked in the [supported-tools matrix](https://samplexbro.github.io/agentsmesh/reference/supported-tools/).

<!-- agentsmesh:tool-list -->
- **CLI agents:** [Aider](https://aider.chat), [Amp](https://ampcode.com), [Claude Code](https://www.anthropic.com/claude-code), [Codebuff](https://github.com/CodebuffAI/freebuff), [Codex CLI](https://github.com/openai/codex), [Crush](https://github.com/charmbracelet/crush), [Deep Agents CLI](https://github.com/langchain-ai/deepagents), [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Goose](https://block.github.io/goose), [Kimi Code CLI](https://moonshotai.github.io/kimi-code/en/), [OpenCode](https://opencode.ai), [OpenHands](https://docs.openhands.dev), [Pi Agent](https://github.com/earendil-works/pi), [Qwen Code](https://github.com/QwenLM/qwen-code), [Rovo Dev](https://www.atlassian.com/solutions/devops/rovo-dev), [Warp](https://www.warp.dev).
- **IDE integrations:** [Amazon Q Developer](https://aws.amazon.com/q/developer), [Antigravity](https://antigravity.google), [Augment Code](https://www.augmentcode.com), [Cline](https://cline.bot), [Continue](https://continue.dev), [GitHub Copilot](https://github.com/features/copilot), [Cursor](https://cursor.com), [Junie](https://www.jetbrains.com/junie), [Kilo Code](https://kilocode.ai), [Kiro](https://kiro.dev), [Roo Code](https://roocode.com), [Trae](https://www.trae.ai), [Windsurf](https://windsurf.com), [Zed](https://zed.dev).
- **Cloud agent platforms:** [Factory Droid](https://www.factory.ai), [Jules](https://jules.google), [Replit Agent](https://replit.com).
<!-- /agentsmesh:tool-list -->

### Project scope (`agentsmesh generate`)

<!-- agentsmesh:support-matrix:project -->
| Feature | Aider | Amazon Q Developer | Amp | Antigravity | Augment Code | Claude Code | Cline | Codebuff | Codex CLI | Continue | GitHub Copilot | Crush | Cursor | Deep Agents CLI | Factory Droid | Gemini CLI | Goose | Jules | Junie | Kilo Code | Kimi Code CLI | Kiro | OpenCode | OpenHands | Pi Agent | Qwen Code | Replit Agent | Roo Code | Rovo Dev | Trae | Warp | Windsurf | Zed |
|---|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|
| Rules | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native |
| Additional Rules | Embedded | Native | Embedded | Native | Native | Native | Native | Native | Native | Native | Native | Embedded | Native | Embedded | Embedded | Embedded | Embedded | Embedded | Native | Native | Embedded | Native | Native | Native | Embedded | Native | Embedded | Native | Embedded | Native | Embedded | Native | Embedded |
| Commands | — | Native | Embedded | Native (workflows) | Native | Native | Native (workflows) | Embedded | Embedded | Native | Native | Embedded | Native | Embedded | Native | Native | Embedded | Partial | Native | Native | Embedded | Embedded | Native | Native | Native | Native | Embedded | Native | Native | Native | Embedded | Native (workflows) | Embedded |
| Agents | — | Native | Embedded | Native | Native | Native | Native | Partial | Native | Native | Native | — | Native | Native | Native | Native | Embedded | — | Native | Native | Native | Native | Native | Native | — | Native | Embedded | Native | Embedded | Native | — | Embedded | — |
| Skills | Native | — | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native |
| MCP Servers | Partial | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Partial | Native | Native | Native | Native | Native | Native | — | Native | Partial | Native | Partial | Native | Native | Partial | Native |
| Hooks | Native | Embedded | Partial | Native | Native | Native | Native | Partial | Native | Native | Native | Native | Native | — | Native | Native | Native | Partial | Partial | Partial | Partial | Native | Partial | Native | Partial | Native | Partial | — | — | Native | Partial | Native | — |
| Ignore | Native | Embedded | Partial | Native | Native | Native | Native | Native | — | Native | — | Native | Native | Partial | Partial | Native (settings-embedded) | Native | Partial | Native | Native | — | Native | Embedded | — | Partial | Native | Partial | Native | Partial | Native | Native | Native | Embedded |
| Permissions | Partial | Embedded | Partial | Partial | Native | Native | Partial | Partial | Native | — | — | Native | Native | Partial | Native | Partial | Partial | Partial | Partial | Native | Partial | Embedded | Native | Partial | Native | Native | Partial | Native | — | — | Partial | Partial | — |
<!-- /agentsmesh:support-matrix:project -->

### Global scope (`agentsmesh generate --global`)

<!-- agentsmesh:support-matrix:global -->
| Feature | Aider | Amazon Q Developer | Amp | Antigravity | Augment Code | Claude Code | Cline | Codebuff | Codex CLI | Continue | GitHub Copilot | Crush | Cursor | Deep Agents CLI | Factory Droid | Gemini CLI | Goose | Jules | Junie | Kilo Code | Kimi Code CLI | Kiro | OpenCode | OpenHands | Pi Agent | Qwen Code | Replit Agent | Roo Code | Rovo Dev | Trae | Warp | Windsurf | Zed |
|---|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|
| Rules | Native | Embedded | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native |
| Additional Rules | Embedded | Embedded | Embedded | Embedded | Native | Native | Native | Embedded | Embedded | Native | Embedded | Embedded | Native | Embedded | Embedded | Embedded | Embedded | — | Embedded | Native | Embedded | Native | Native | Native | Embedded | Native | — | Native | Embedded | Native | Embedded | Embedded | Embedded |
| Commands | — | Native | Embedded | Native (workflows) | Native | Native | Native (workflows) | Embedded | Embedded | Native | — | Embedded | Native | Embedded | Native | Native | Embedded | — | Native | Native | Embedded | Embedded | Native | Native | Native | Native | — | Native | Native | Native | Embedded | Native (workflows) | Embedded |
| Agents | — | Native | Embedded | Native | Native | Native | — | Partial | Native | Native | Native | — | Native | Native | Native | Native | Embedded | — | Native | Native | Native | Native | Native | Native | — | Native | — | Partial | Embedded | Native | — | Embedded | — |
| Skills | Native | — | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native |
| MCP Servers | Partial | Native | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native | Native | Native | Native | Native | — | Native | Native | Native | Native | Native | Native | — | Native | — | Partial | Native | Native | Native | Native | Native |
| Hooks | Native | Embedded | Partial | Native | Native | Native | Native | Partial | Native | Native | Native | Native | Native | Native | Native | Native | Native | — | Embedded | Partial | Native | Partial | Partial | Native | Partial | Native | — | — | Native | Native | Partial | Native | — |
| Ignore | Native | Embedded | Partial | — | — | Native | — | — | — | Native | — | Native | Native | Partial | Partial | — | Native | — | — | — | — | Native | Embedded | — | Partial | — | — | — | Partial | — | Partial | Native | Embedded |
| Permissions | Partial | Embedded | Partial | Native | Native | Native | Partial | Partial | Native | Native | Partial | Native | Native | Embedded | Native | Native | Native | — | Native | Native | Native | Native | Native | Partial | Native | Native | — | Partial | Native | Partial | Native | Partial | Native |
<!-- /agentsmesh:support-matrix:global -->

## Documentation

- [Getting started](https://samplexbro.github.io/agentsmesh/getting-started/installation/): install and first run
- [Canonical config](https://samplexbro.github.io/agentsmesh/canonical-config/): rules, commands, agents, skills, MCP, hooks, ignore, permissions
- [CLI reference](https://samplexbro.github.io/agentsmesh/cli/): every command and flag
- [Guides](https://samplexbro.github.io/agentsmesh/guides/existing-project/): adopting in an existing repo, lessons, sharing config, plugins
- [Reference](https://samplexbro.github.io/agentsmesh/reference/supported-tools/): supported tools, generation pipeline, managed embedding, API

## Contributing and license

Contributions welcome: edit canonical `.agentsmesh/` sources, never the generated files. See [CONTRIBUTING.md](CONTRIBUTING.md). Released under the [MIT license](LICENSE).
