# Changelog

## 0.36.0

### Minor Changes

- 803593d: **Added — lexical retrieval on task text.** A keyword-only recall — the `UserPromptSubmit` hook, `agentsmesh lessons query --keyword`, and the MCP `lessons_query` keyword path — now also reaches lessons by the wording of their rule, scored with the ranker's existing BM25. A conceptual lesson fires when the prompt says the same thing in different words than its keyword trigger. Up to three wording matches join the candidates when a rule shares at least two distinct, non-generic terms with the task text; they rank below every triggered lesson, respect the usual caps, and are labelled `lexical: true` in `--json` output and counted as `matchedByKind.text` in the recall log. It never runs for a file or command query. Zero new dependencies, about a millisecond per call.

## 0.35.0

### Minor Changes

- 91d9107: **Changed — lessons recall runs once per tool call.** `agentsmesh init --lessons` no longer wires `agentsmesh lessons hook` under `PostToolUse`, and removes an entry an older scaffold left there while leaving your own `PostToolUse` hooks alone. `PreToolUse` fires before every tool call, so the second recall only re-ran after the fact: one more process and one more context block per call, with advice that arrived too late to apply. No target injects on `PostToolUse` without also supporting `PreToolUse`, so nothing is lost.

  **Added — `"telemetry": true` in `.agentsmesh/lessons/config.json`.** The recall, capture and outcome logs behind `lessons stats`, effectiveness ranking and the `validate` health view could previously be enabled only by an environment variable. A hook spawned by a desktop app inherits none of your shell exports, so with that gate every hook stayed silent while the CLI in a terminal kept logging, and the effectiveness signal quietly died. The project config is visible to any process; `AGENTSMESH_LESSONS_TELEMETRY` still overrides per process (`1` on, `0` off).

  **Added — `NEVER_RECALLED` in `agentsmesh lessons validate`.** One aggregate warning, with every id on `lessonIds`, for active lessons that predate the recall log's window and never fired across at least 500 recalls. In a mature graph that was 59% of all lessons: trigger cost with no return. Advisory only; inspect with `show`, retarget the trigger, or `deprecate`.

## 0.34.0

### Minor Changes

- d942093: A repo-wide bug hunt across the generation pipeline, canonical loader, CLI parser, MCP server, lessons memory, install routing and the per-target adapters. Several fixes change behaviour you may have been working around, so those are called out below.

  **Fixed — silent data loss.** `agentsmesh generate` no longer deletes a hand-written `AGENTS.md`, `CLAUDE.md` or `.claudeignore` on its first run in a project: a static output is only evicted when the lock proves agentsmesh wrote it. Uninstalling the last pack now sweeps the files it generated and resets the lock, instead of leaving orphans that `agentsmesh check` reported as in sync. The lessons git merge driver no longer drops a captured rule when two branches mint the same lesson id. A `---` inside rule frontmatter no longer truncates the value and leaks the remainder into every generated file, and CRLF canonical sources stop reporting a permanent phantom diff.

  **Fixed — a broken canonical file is no longer treated as an absent one.** A syntax error in `.agentsmesh/mcp.json`, `permissions.yaml` or `hooks.yaml` was caught and returned as "nothing here", so `generate` succeeded while every MCP server, permission or hook silently vanished from every tool. These now fail with the offending file path; `agentsmesh install` still skips a broken file in third-party content and warns.

  **Fixed — CLI argument parsing.** `--flag=value` is honored everywhere; it was previously stored under a bogus key and ignored, so `agentsmesh generate --targets=cursor` wrote every target. Boolean flags no longer consume the following word, so `agentsmesh refresh --dry-run <pack>` previews instead of performing a real refresh, and `agentsmesh installs --global list` reports the global inventory. `--json` output stays parseable on a TTY, and `agentsmesh lessons --help` lists the implemented `--always`, `--session`, `--no-dedup`, `--ids` and `--scope` flags.

  **Fixed — install and refresh.** `agentsmesh install <source> --global` writes to `~/.agentsmesh/` when the picker routes the install, and `--accept-hooks`, `--accept-permissions` and `--accept-mcp` now reach marketplace sub-packs. One invalid row in `installs.yaml` no longer truncates the file on the next write, GitLab SSH sources keep their org and repo, remote cache keys can no longer collide between two repositories, and an install lock whose holder is still running is not evicted.

  **Fixed — per-target adapters.** Windsurf hook events survive a round trip instead of arriving as dead `session_start` keys in other tools, and an imported hook keeps its canonical matcher. Cursor command files carry their `description` as frontmatter, so it survives generate and import. An unscoped Codex rule embeds into the root `AGENTS.md` rather than creating a top-level directory Codex never reads. A lone `.mcp.json` no longer enrolls Deep Agents CLI in every Claude Code repository. A user-authored `UserPromptSubmit` hook now warns instead of disappearing on targets that cannot carry it.

  **Changed — lessons recall precision.** Keyword triggers match whole tokens, so a rule keyed on `art` no longer fires on "start". Recall ranks by how precisely a trigger matched: an exact path beats a file class, which beats a subtree glob, which beats a keyword that only matched through the path's own tokens. `agentsmesh lessons add` rejects an empty rule and a command pattern that matches nearly every command, and `agentsmesh lessons validate` reports `BROAD_FILE_GLOB`, `BROAD_COMMAND_PATTERN` and `EMPTY_RULE` for graphs captured before those guardrails existed.

  **Added — plugin descriptors.** `managedOutputs.supersededFiles` declares alternate instruction locations that your primary root replaces; they are evicted only when a run emits that root, which is how a legacy nested file is migrated without deleting user content. `agentsmesh.local.yaml` now merges `plugins`, `pluginTargets` and `collaboration` instead of dropping them, and warns about keys it does not handle.

## 0.33.0

### Minor Changes

- 3eeadbc: **Four capability gaps closed, all verified against each tool's own docs or source.**

  **opencode: `ignore` is now generated (both scopes).** Canonical ignore patterns become `permission.read` / `permission.edit` path deny rules in `opencode.json`. The obvious-looking key, `watcher.ignore`, is deliberately _not_ used — it scopes the filesystem watcher and never blocks a read, so mapping ignore there would have advertised exclusion that does not exist and left `.env` fully readable. No `"*"` catch-all is written, because user rules append after opencode's built-in defaults under last-match-wins, so a generated blanket allow would silently undo opencode's own `.env` protection. Per-pattern rules do carry both actions: a gitignore negation (`!pattern`) becomes an `allow` rule and round-trips back to `!pattern` on import. `grep`/`glob` rules are left alone since they match the search string rather than the file path; the lint warning now names that residual gap instead of claiming ignore is unsupported.

  **crush: global `ignore` is now generated.** `~/.config/crush/ignore` — extensionless and without a leading dot, matching what Crush's `internal/fsext/ls.go` actually reads. Generate, import and reference-rewriting all cover the global scope now.

  **augment-code: project `permissions` are now generated.** Augment documents `.augment/settings.json` as repo-level settings committed to the project, carrying the same `toolPermissions` shape as the user file, so a team can check a tool policy into the repo. Honored by the Auggie CLI and Cosmos cloud agents, not the IDE extension.

  **deepagents-cli: global `permissions` are now generated (embedded).** Canonical allow entries map onto `shell.allow_list` in `~/.deepagents/config.toml`, merged key-scoped so unrelated settings in that shared file survive. The mapping is lossy by nature — dcode has no deny rules, no ask rules and no per-tool patterns — so `deny` and `ask` entries now raise a lint warning naming what was dropped instead of disappearing silently.

- 4602b6f: **Eleven capability gaps closed across Continue, Amazon Q and Warp — plus three defects found along the way that were losing user data.**

  **Continue: agents and hooks are now generated at both scopes.** Agents are `.continue/agents/<name>.md` — Markdown with `name`/`description`/`model`/`tools` frontmatter, where `tools` and `rules` are comma-separated strings because upstream types them as `z.string()` and rejects the whole file on a YAML list. Hooks are the `hooks` key of `.continue/settings.json`, reusing the Claude Code serializer since Continue's loader documents the same 17 event names and the same file shape. `.continue/agents/*.yaml` assistant profiles are treated as user-owned: never written, never imported, never deleted.

  **Amazon Q: ignore and global rules now reach the agent.** Ignore patterns become `toolsSettings.fs_read.deniedPaths` / `fs_write.deniedPaths` in the agent JSON — Q CLI has no ignore file anywhere. Global rule files are still written to `~/.aws/amazonq/rules/`, but Q CLI never reads that directory on its own (`paths.rs` `mod global` has no rules constant), so the generated agent JSON now carries a `file://~/.aws/amazonq/rules/**/*.md` glob in its `resources` array — that entry is what makes the files reachable. `rules` at global scope is therefore honestly `embedded` rather than `native`.

  **Warp: project ignore, global rules and global permissions.** `.warpindexingignore`, `~/.agents/AGENTS.md`, and the four `[agents.profiles]` keys in `~/.warp/settings.toml`, merged key-scoped so unrelated settings survive.

  Three fixes to behaviour that was already shipping:
  - **Every generated Amazon Q agent was silently dropping your project rules.** Q's `Agent` struct declares `resources` with `#[serde(default)]`, so a custom agent inherits nothing from the built-in default agent — including its `.amazonq/rules/**/*.md` glob and the `AGENTS.md` / `README.md` / `AmazonQ.md` documentation resources. Running `q chat --agent <name>` saw none of them. Generated agents now carry full default-agent parity.
  - **Warp permission revocation was a no-op.** Removing an entry from `permissions.yaml` left the old allowlist in `settings.toml`, so a revoked `Bash(curl:*)` kept auto-running. agentsmesh now owns those four keys outright and rewrites them on every emit.
  - **Warp's regexes were being escaped into dead literals.** Warp's allow/denylists are regexes, so `import --global` followed by `generate --global` turned a user's `rm -rf .*` deny rule into `rm -rf \.\*`, which matches nothing. Payloads now round-trip verbatim; allowlist entries are anchored `^…$` and denylist entries left unanchored, each taking the narrower reading of Warp's undocumented match semantics so no rule can come back weaker.

  Amazon Q's embedded features (hooks, permissions, ignore) are now gated on their own `features` entries via `emitScopedSettings`, so disabling a feature no longer leaks it into the agent JSON. Amazon Q import merges into `.agentsmesh/ignore` instead of overwriting it, preserving comments and `!` negations that Q cannot express, and Warp import preserves canonical `ask` plus entries Warp has no key for.

- 00d58e3: **Twelve capability gaps closed across Zed and Antigravity — and a bug that deleted your Zed editor config.**

  **Zed.** Global rules now write `~/.config/zed/AGENTS.md`, the real file that replaced the database-backed Rules Library in v1.4.0, with secondary rules folded into it. Ignore projects onto `file_scan_exclusions` and `private_files` in `settings.json` at both scopes — `file_scan_exclusions` is a splicing list, so the `"..."` entry is appended to preserve Zed's own defaults, while `private_files` extends and must not carry it. Global permissions write `agent.tool_permissions`, mapped onto the five Zed tools that accept patterns, with `case_sensitive: true` so Zed's case-insensitive default cannot widen a grant. Commands ride the skills surface through the existing `supportsConversion` mechanism, emitting byte-identical output to codex-cli so the two dedupe instead of colliding. Project permissions are now correctly `none`: `.zed/settings.json` is parsed as `ProjectSettingsContent`, which has no `agent` field at all, so anything written there was discarded.

  **Antigravity.** Project MCP is generated again — it had been deliberately suppressed, so every developer re-added their servers by hand in each repo — along with project and global agents, and `.antigravityignore`. Global permissions write `~/.gemini/antigravity-cli/settings.json`. The MCP config files (`.agents/mcp_config.json` project, `~/.gemini/config/mcp_config.json` global) are merged per server key, so the Antigravity-only `disabled`, `disabledTools`, `cwd`, `oauth` and `authProviderType` keys survive regeneration.

  Three fixes to behaviour that was already shipping:
  - **`agentsmesh generate` could delete your entire Zed editor config.** `.zed/settings.json` was listed in `managedOutputs.files`, so any run that produced no MCP servers treated it as a stale artifact and removed it. Neither Zed settings file is a managed output any more.
  - **Zed generation overwrote hand-written permission rules.** Merging was per-tool whole-list replace. Ownership is now per pattern, decided by whether a rule decodes cleanly back to canonical — so `^cargo\s+(build|test)$`, `^sudo` and anything malformed survive every run, while agentsmesh's own grants are still revoked when removed from canonical.
  - **Zed and Antigravity imports overwrote canonical files.** Importing merges now: ignore entries match by glob rather than line text, so `dist/` is recognised in `**/dist` instead of churning, and canonical entries the target cannot express are preserved rather than dropped.

  Zed reads `settings.json` as JSONC and its default file is mostly comments, which `JSON.stringify` would destroy. agentsmesh now leaves a non-strict-JSON settings file completely untouched rather than rewriting it without the user's comments — safer than the previous behaviour, which replaced it with `{}`.

- bf88aaa: **The last nine capability gaps closed across six targets — and four fixes to config-destroying behaviour.**

  **kiro** — permissions at both scopes. Global writes `~/.kiro/settings/permissions.yaml` with canonical allow/deny/ask mapping straight onto Kiro's `effect`. Project embeds into the `.kiro/agents/<name>.md` frontmatter agentsmesh already writes, because Kiro stores workspace rules outside the repository and a cloned repo cannot inject permissions. Lint says so, and says that embedded rules apply only while that agent is active.

  **pi-agent** — permissions at both scopes via `defaultTools` in `.pi/settings.json` and `~/.pi/agent/settings.json`. The mapping is deliberately narrow: Pi has an allow-list over eight built-in tools and no deny, ask, path or command matching, so every canonical entry that cannot be expressed is named in a lint warning.

  **aider** — hooks at both scopes via `.aider.conf.yml`. Three canonical events map onto command keys — `PostToolUse` with an edit-tool matcher to `lint-cmd`, `PostToolUse` with a wildcard matcher to `test-cmd`, and `Notification` to `notifications-command` — with `auto-lint` / `auto-test` written alongside the first two. Canonical hooks that fit none of those shapes are warned about rather than faked.

  **goose** — project MCP via `.agents/plugins/agentsmesh/.mcp.json`. **replit-agent** — commands and agents project onto the repo-committed `.agents/skills/` surface, byte-identical to codex-cli's output so the two dedupe rather than collide.

  **trae** — global permissions were investigated and left at `partial`, not raised. Trae's `~/.trae/permission/global.json` is real, but canonical allow/deny/ask does not map onto its `resourceAuthorization` / `commandRules` split faithfully enough to call native. The gap stays open and visible in the audit rather than being closed dishonestly.

  Four fixes to behaviour that was already shipping:
  - **Goose project MCP erased `cwd` and any hand-added server key.** MCP went through the one emission path that passes no merge callback, so the file was rewritten wholesale. Both scopes now route through merge-capable paths; `cwd`, `timeout`, `$schema` and unknown keys survive.
  - **Deleting pi-agent permissions silently widened access.** Removing `defaultTools` handed every built-in back, including `bash` and `write`. A canonical file whose entries project onto no Pi built-in — only scoped `Bash(...)` patterns, say, or only deny/ask rules — now writes `defaultTools: []`, which fails closed. An _empty_ canonical permissions file still writes nothing at all: it is not a claim that no tool is approved. Revoking a previously written array is handled separately, by `revokePiAgentPermissions` through `scopeExtras`.
  - **Kiro generation overwrote hand-written permission rules.** Ownership is now per rule: a rule is agentsmesh's only when its keys are a subset of `{capability, match, effect}` and it projects back onto canonical, so `exclude` protections and unknown capabilities survive with their comments.
  - **`.aider.conf.yml` had two writers competing.** It now has one, and every key agentsmesh owns carries a generated-by marker comment — so an `auto-lint: false` you set by hand is never flipped, and only marked keys are removed when they leave the projection.

  Kiro and pi-agent imports also stopped overwriting canonical: silence about `deny` is no longer read as revocation of `deny`, so a Kiro file holding only allow rules can no longer drop `Read(./.env)` from canonical and cross-contaminate every other target.

- 08240d8: Recall now carries a session correlator on every path, so repeated recalls stop re-delivering rules the agent has already been shown. Field telemetry from a long-running project measured **58.7% of all delivered rule-tokens as intra-session repeats** — dedup existed but nothing supplied it with a session id outside hook-driven recall.

  `agentsmesh lessons query` accepts `--session auto`, which resolves to `AGENTSMESH_SESSION_ID` when exported and otherwise to a project-scoped day key — so a prose-driven (non-hook) agent gets dedup within a working session. The scaffolded recall ritual and the `lessons` skill now pass `--session auto` on both the per-action and task-start queries; re-run `agentsmesh init --lessons` (or regenerate) to pick up the new wording.

  Suppression is only safe while the agent that saw a rule still has it in context, so it is bounded on three sides. On a hook-capable target, `SessionStart` now resets dedup for every source except `resume`: `startup` means a new chat, `compact`/`clear` mean the context was summarized or wiped, and an unrecognized source resets too. The reset clears both the harness session's set and the CLI/MCP correlator stores, which are separate files — previously a compaction cleared only the first, leaving an agent's own `--session auto` recalls suppressed against a context that no longer held those rules. Without a hook there is no such signal, so a 30-minute idle gap resets the whole session and every entry expires one hour after delivery. `--no-dedup` re-shows everything for one call, covering the residual case of a new chat opened immediately after the last one on a target with no hook.

  **Behavior change:** the MCP `lessons_query` tool now deduplicates by default. The correlator is `AGENTSMESH_SESSION_ID` when set, otherwise the server process, and a lesson already delivered in that session is withheld and counted in the new `suppressed` field. Pass `no_dedup: true` to re-show everything (for example after the client compacts its context), or `session` to control the scope explicitly. Agents that re-query the same file repeatedly will now receive empty result sets where they previously received the same rules again — `suppressed` distinguishes "already shown" from "nothing applies". Because the server never observes the client compacting its context, MCP suppression is bounded by the same windows as `--session auto` — a 30-minute idle reset and a one-hour ceiling per entry — so a rule that was summarized away always comes back rather than staying hidden for the server's lifetime.

  `agentsmesh lessons stats` is now self-diagnosing. When the numbers match a known pathology it appends an `advice` line naming the cause and the fix (also an `advice` key in `--json`): high intra-session redundancy on recalls that carry no session id means dedup is inert and the ritual should pass `--session auto`; a no-match rate dominated by command-only recalls against a graph with few `command_pattern` triggers means command-shaped lessons need `--trigger-cmd`. Silence is the default.

  The capture-on-failure nudge now pre-fills a concrete command trigger. Instead of a `<regex matching the command>` placeholder it derives the failed command's class (`--trigger-cmd 'git commit'`), regex-escaped, falling back to the placeholder when no safe class can be derived — command-shaped lessons were starving because authors skipped the fill-in-the-blank. Each nudge also states the rule shape that makes a lesson worth reading: cite the symptom, and say why the obvious fix is wrong.

  Command recalls that cannot possibly match now exit early. The recall hook fires on every shell command, but most command-only recalls match nothing (over 80% in the field), so a temp-dir cache of the active command-reachable trigger patterns — stamped against the lessons graph and refreshed automatically — lets a provable no-match skip the full graph load. The cached verdict is computed with the same matcher the full recall path uses, and any doubt (missing, stale, or unreadable cache) falls back to the full path, so the worst case is no speedup rather than a skipped recall.

- 1a5254f: **Three new targets: OpenHands, Kimi Code CLI and Codebuff.** agentsmesh now supports 33 tools.

  **OpenHands** (`openhands`) — the open-source autonomous coding agent. Rules to `AGENTS.md`, path-scoped rules and skills to `.agents/skills/`, subagents to `.agents/agents/`, commands and MCP into a `.agents/plugins/agentsmesh/` bundle, and hooks to `.openhands/hooks.json`. Hooks are the one surface that did _not_ move to `.agents/`, and its `HookConfig` forbids unknown keys outright, so only verified snake_case events are emitted. `AGENTS.md` is written with no frontmatter because OpenHands injects that file verbatim into the prompt.

  **Kimi Code CLI** (`kimi-code`) — Moonshot AI's terminal agent. Rules to `AGENTS.md`, subagents to `.kimi-code/agents/`, skills to `.kimi-code/skills/`, MCP to `.kimi-code/mcp.json` (a genuine project-scope MCP file, which is rare), and hooks plus permissions into `~/.kimi-code/config.toml`. Those last two are user-scope only — Kimi Code has no project config file. That TOML also holds provider API keys in plain text, so agentsmesh merges key-scoped and never rewrites the file.

  **Codebuff** (`codebuff`) — the multi-agent terminal CLI. Rules to `AGENTS.md` including nested per-directory files, skills to `.agents/skills/`, MCP to `.agents/mcp.json`, and ignore to `.codebuffignore`. Agents and permissions stay `partial`: Codebuff agents are executable TypeScript modules, and agentsmesh generates config, not code.

  OpenHands and Codebuff both read `.agents/skills/`, which `codex-cli` owns, so each emits byte-identical skill content and is registered as a native `.agents/` writer — without that, `generate --global` alongside Claude Code threw `Conflicting generated outputs`. Kimi Code writes its own `.kimi-code/skills/` at both scopes and is not part of that set.

  Two behaviours worth knowing before you run this:
  - **Kimi Code concatenates every instruction file it finds** rather than picking the first, so a `.kimi-code/AGENTS.md` left over from a previous setup would double your rules in the prompt. It is now a managed output and `agentsmesh generate` removes it; the root `AGENTS.md` carries the merged content.
  - **Codebuff's scope precedence is inverted** relative to every other target: it searches `[cwd/.agents, cwd/../.agents, ~/.agents]` last-write-wins, so a global file overrides the project one. It also has a middle scope (the parent directory, for monorepos) that agentsmesh cannot express.

- e629741: **Amazon Q Developer: commands are now native.** The Q CLI reads saved prompts as flat `<name>.md` files from `.amazonq/prompts/` (workspace) and `~/.aws/amazonq/prompts/` (user), invoked as `/prompts`. AgentsMesh now generates and imports both scopes. Q reads the file body verbatim, so no frontmatter is emitted; a lint warning reports `description` / `allowed-tools` metadata that the format cannot carry, and names outside `^[a-zA-Z0-9_-]{1,50}$` (including `:`-namespaced commands, which Q cannot nest) are rewritten with a warning naming the resulting file.

  **Claude Code: global hooks now actually load.** `agentsmesh generate --global` wrote hooks to `~/.claude/hooks.json` — a file Claude Code never reads. Its documented hook locations are `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, managed policy, and plugin/skill/subagent frontmatter; there is no standalone `hooks.json`. Global hooks now merge into `~/.claude/settings.json` under `hooks`, matching project scope, and the stale `~/.claude/hooks.json` is removed on the next `generate`. Import still reads the old file so existing setups migrate.

  **Gemini CLI: permissions are no longer written into the project.** Gemini's policy engine documents its Workspace tier (`<repo>/.gemini/policies/`) as non-functional, so the `permissions.toml` AgentsMesh generated there was a security policy the tool silently ignored — deny rules that never applied. Permissions now emit only at global scope (`~/.gemini/policies/permissions.toml`, unchanged) via `globalSupport.scopeExtras`, and a project-scope lint warning points users at `agentsmesh generate --global`. The stale project file is left in place: `.gemini/policies/permissions.toml` is a `coOwnedFiles` entry at both scopes, which stale cleanup never deletes, because a user may have added their own `[[rule]]` blocks to it since. Delete it by hand if you want it gone.

### Patch Changes

- 20ff933: **Disabling a feature no longer deletes the user config file that feature wrote into.**

  `cleanupStaleGeneratedOutputs` treated every entry in a target's `managedOutputs.files` as agentsmesh-owned: any path the current run did not emit was `rm -rf`'d. A run with `mcp` turned off emits nothing for `.codex/config.toml`, so the file — the user's own Codex model, provider and trust config — was deleted outright, and the CLI reported "Nothing changed."

  `TargetManagedOutputs` now has a second list:
  - `files` — agentsmesh owns the file outright; a run that stops emitting it deletes it (this is how revocation works).
  - `coOwnedFiles` — agentsmesh writes into the file but the user owns it too. Never deleted; the descriptor's `mergeGeneratedOutputContent` hook keeps the user's content on the runs that do write it.

  31 paths across 17 targets moved from `files` to `coOwnedFiles`: `.codex/config.toml`, `.mcp.json` / `~/.claude.json`, `.claude/settings.json`, `.vscode/mcp.json`, `.vscode/settings.json`, `.gemini/settings.json`, `.qwen/settings.json`, `crush.json`, `opencode.json`, `kilo.jsonc`, `.amp/settings.json`, `.augment/settings.json`, `.agents/mcp_config.json`, `.openhands/hooks.json`, `.deepagents/.mcp.json`, `.junie/config.json`, `.rovodev/config.yml`, `~/.config/goose/permission.yaml` and their global counterparts.

  Stale cleanup reads `files` only, and skips `coOwnedFiles` during the directory sweep too — a co-owned file living inside a managed directory was otherwise still deleted.

  A repo-wide invariant test now fails the build if any registered descriptor — builtin or plugin — lists a co-owned path in `managedOutputs.files`. Co-ownership is recognised through all three mechanisms agentsmesh actually uses: a descriptor `mergeGeneratedOutputContent` hook, the `SETTINGS_JSON_PATHS` fallback in `mergeOutputContent`, and a `scopeExtras` generator that reads the existing file and merges internally. The last two are why `.claude/settings.json` (the user's model, env and hook config) and goose's `permission.yaml` (which holds goose's own `smart_approve` cache) were still being deleted after the first pass — neither has a descriptor hook. Exceptions are an explicit, commented allowlist.

  **Behaviour change:** emptying `hooks.yaml` no longer removes `.openhands/hooks.json`. That file is user-authored and holds `HookType.AGENT` handlers canonical cannot express; a feature-disable run and an empty-canonical run are indistinguishable at cleanup time, so the file is kept. Revocation is still event-scoped — rewriting `hooks.yaml` drops the handlers agentsmesh no longer emits.

  **Known gap:** `agentsmesh uninstall` relied on stale cleanup deleting these files, so agentsmesh's own `mcpServers` / `[mcp_servers.*]` blocks now survive an uninstall in a co-owned file instead of going with it. The same applies to disabling a feature. Leaving a stale server behind is the safer failure than deleting the user's model and auth config, but it is not the end state: revoking owned keys on disable needs an explicit clear-owned-keys pass across all 31 paths (`src/targets/pi-agent/permissions-revoke.ts` is the existing precedent) and is not in this change.

  **Plugin authors:** `coOwnedFiles` is optional and additive. Any path your `mergeGeneratedOutputContent` claims belongs there rather than in `files`; the schema rejects a path listed in both.

- 5ca7d7b: **A comment in your config no longer costs you the whole file.**

  Six mergers parsed the user's file with `JSON.parse` and coerced an unparsable base to `{}` before serialising their own keys over the top. One `//` line was enough to lose everything else in the file:

  ```jsonc
  // before
  {
    // my editor prefs
    "editor.fontSize": 14,
    "files.exclude": { "**/.git": true }
  }

  // after `agentsmesh generate` with roo-code enabled
  {
    "roo-cline.allowedCommands": ["Bash(ls)"]
  }
  ```

  This was live on files that are comment-legal by design: `.vscode/settings.json` (VS Code ships its own settings commented), `kilo.jsonc` (the format's name is JSON-with-comments), `.qwen/settings.json`, and the shared `.claude/settings.json` / `.gemini/settings.json` / `crush.json` mergers.

  All six now preserve a base they cannot parse, via one shared guard (`preservedUnparsableBase`). That is the rule `mergeOwnedJsonKeys` already followed — these sites simply never routed through it.

  The trade-off is unchanged and deliberate: on a commented file, agentsmesh writes nothing and reports the path as `unchanged`, so generated content is silently not applied there. Preserving a file we cannot safely rewrite beats destroying it, but the run gives no warning yet.

  Eleven existing tests asserted the old behaviour — names like "falls back to `{}` when the base JSON is invalid" and "replaces invalid existing settings.json". They encoded the data loss as intended behaviour and were rewritten to the new contract rather than removed.

- 0c775e1: **`generate` no longer deletes files inside a managed directory that agentsmesh never wrote.**

  `managedOutputs.dirs` was swept recursively and every file found that the current run did not emit was `rm -rf`'d. Those directories are shared: Kiro's Agent Hooks UI writes `.kiro/hooks/*.kiro.hook`, Cursor's rule generator writes `.cursor/rules/*.mdc`, users hand-author `~/.claude/skills/**`, and `.agents/skills` is the cross-tool skills convention. A single `generate` removed all of them — on a fresh project, the very first run did it before any lock existed.

  This is the same ownership bug `coOwnedFiles` fixed for `managedOutputs.files`. Directories could not be fixed the same way because their contents are dynamic (one file per rule, command, agent, skill), so no descriptor can enumerate them. The lock's `outputs` map is the missing record: cleanup runs before the lock is rewritten, so the map on disk is still the previous run's list of everything agentsmesh generated.

  A file discovered by the directory sweep is now deleted only when the previous run's lock says agentsmesh wrote it. Renaming a rule still evicts its old output. `managedOutputs.files` and `coOwnedFiles` are unchanged.

  Two related fixes:
  - **No provenance means no directory deletions.** A first run, a lock written before the `outputs` map existed, or a lock lost to `agentsmesh merge` leaves the sweep with nothing to go on, so it deletes nothing that run. Be aware this is not a one-run window: the lock a run writes records only what that run generated, so a file agentsmesh wrote earlier and no longer emits is never re-recorded and stays on disk indefinitely. Removing such an orphan is a manual step. That is the deliberate trade: an unwanted file that lingers is recoverable, a deleted one is not.
  - **A filtered run (`--targets x`) leaves a configured-but-inactive target's directories alone.** `.agents/skills` is managed by amp, zed, goose, codex-cli and others, so `generate --targets zed` used to delete amp's generated skills. Provenance cannot tell them apart — agentsmesh did write them — so the guard is ownership: a directory another configured target also manages is skipped until the next unfiltered run.
  - An empty run no longer wipes the lock's `outputs` map, which would have made everything already on disk permanently unevictable.

  **`agentsmesh check` reports these files as a notice, not as drift.** Because `generate` no longer removes them, reporting them as stale generated output would exit 1 with no remedy — neither `agentsmesh merge` nor `generate --force` can clear a file agentsmesh does not own. They now appear under a new `outputsUntracked` list that is deliberately excluded from `outputDrift` and `inSync`:

  ```
  ✓ Lock file is in sync.
  1 file(s) in managed directories were not written by agentsmesh (left untouched):
    .kiro/hooks/my-hook.kiro.hook
  ```

  The signal is kept — a rule hand-added straight into `.claude/rules` instead of canonical still shows up — without turning a tool doing its job into a failed build. Four tests asserted the old exit-1 behaviour and were updated to the new contract rather than removed.

- c233472: **`agentsmesh merge` no longer strands generated files forever.**

  `resolveLockConflict` wrote the resolved `.agentsmesh/.lock` with no `outputs` key. That map is the provenance the managed-directory sweep gates on — a discovered file is deleted only when the previous lock says agentsmesh wrote it — so after a merge the sweep had nothing to go on and deleted nothing it found.

  That was not a one-run deferral. A full `generate` **replaces** the outputs map with only what that run emitted, so a file generated before the merge and no longer emitted could never appear in any future map. It was never evicted, and `agentsmesh check` listed it indefinitely.

  The map now carries forward as the union of both conflict sides. It records only paths agentsmesh itself wrote, so widening it can never make a foreign file deletable — it can only restore paths that were already ours. Where both sides claim the same path, ours wins; the hashes may be stale until the next generate rewrites them, which is the same state a filtered run already leaves behind and which `check` reports.

  A lock with no `outputs` on either side stays without one, so an old-format lock is not silently upgraded to an empty map — `readLock` distinguishes the two and `check` relies on it.

- 779c89e: **`.roomodes` is no longer replaced wholesale — your hand-written Roo Code project modes survive.**

  `.roomodes` is Roo Code's own project custom-modes store: Roo writes it whenever you create a mode at Project scope. `generateAgents` emitted the entire file from canonical, and the mode-scoped merger claimed only the Global twin (`~/.roo/settings/custom_modes.yaml`), so `.roomodes` fell through to whole-file replacement. Every mode you authored was deleted, and modes that shared a slug with a canonical agent lost `whenToUse`, `customInstructions`, `iconName` and the tuple group form (`- - edit` / `fileRegex`).

  `.roomodes` was also in `project.managedOutputs.files`, the stale-cleanup delete list, so turning the `agents` feature off deleted the file outright.

  `mergeRooCustomModesYaml` now claims both paths, and `.roomodes` moved to `coOwnedFiles`. Ownership is per mode, recorded by the `# agentsmesh:` marker comment the merger writes — the same convention `.aider.conf.yml` uses:
  - a marked mode, or one whose slug canonical still owns, is agentsmesh's and is re-emitted;
  - everything else is yours and is kept verbatim;
  - within a re-emitted mode, fields canonical cannot express are carried over.

  Only one path resolves per run — the global layout suppresses `.roomodes` and emits the settings file from `scopeExtras` — so claiming both scopes in one merger cannot collide.

  **Also fixes a marker bug that affected the global file too.** Re-parsing the YAML moves the comment above the _first_ sequence item onto the sequence node itself, so the first generated mode read back as unmarked. It was treated as the user's and never revoked — deleting that agent left its mode behind permanently. The merger now reads the marker from where the parser actually puts it. This was live in `~/.roo/settings/custom_modes.yaml` since the global merge shipped.

  Two limits worth knowing:
  - Deleting **every** agent leaves the last generated modes in place. `generateAgents` returns nothing for empty canonical, so the merger never runs — the same revocation-to-empty gap documented for the other co-owned files.
  - A `.roomodes` that is not a YAML mapping is returned verbatim rather than rewritten, so generated modes are silently not applied to it.

- 6e7b06f: **Global-scope generation no longer replaces user config files it only partly owns.**

  `scopeExtras` — the hook targets use for global-only outputs — pushed its results straight onto the result list, bypassing the shared merge policy that every other emission path goes through. Six paths were rewritten from canonical alone:
  - `~/.continue/config.yaml` — Continue's personal assistant config. The first `generate --global` erased the user's `models` blocks (**including `apiKey` / `apiBase`**), `context` providers, `docs`, hand-written rules and prompts, and overwrote the assistant `name` with the literal `agentsmesh`.
  - `~/.continue/permissions.yaml` — the approval cache Continue writes when the user picks "always allow" / "always ask" / "exclude".
  - `~/.copilot/mcp-config.json` — servers registered with `copilot mcp add`.
  - `~/.gemini/policies/permissions.toml`
  - `~/.deepagents/hooks.json`
  - `~/.roo/settings/custom_modes.yaml`

  `scopeExtras` results now route through the same `mergeOutputContent` policy as the feature loop, with pending-result dedup. Targets whose file needed key-scoped ownership gained a `mergeGeneratedOutputContent` hook; the affected paths moved to `managedOutputs.coOwnedFiles` so stale cleanup cannot delete them either.

  Reading the existing file is not the same as merging it. `~/.copilot/mcp-config.json` was read on every run — but only to decide whether to report "created" or "updated", never as a merge base. Any audit of this class has to check whether the existing content reaches the emitted content, not whether the file was opened.

  Two related merge fixes, each its own silent data loss:
  - `mergeSettingsJson` now merges _inside_ `permissions`, so the user's `defaultMode` and `additionalDirectories` survive a write instead of being dropped every time agentsmesh wrote allow/deny/ask.
  - `mergeCrushConfigJson` now merges inside `permissions` and `options`, so `options.debug` survives.

  **`agentsmesh init` no longer scaffolds `allow: []` / `deny: []` / `ask: []`.** Those keys are commented-out examples now. An explicit empty list is a real instruction — "grant nothing" — not a placeholder, and targets that project permissions into a shared config file apply it. A user adopting agentsmesh with existing permissions in `.claude/settings.json` would have had them cleared. Absent keys mean "agentsmesh manages nothing here yet", which is what a fresh init actually means.

  **Known gap, unchanged by this release:** emptying a canonical list still does not revoke what a previous run wrote into a co-owned file. Co-owned files are never deleted (that is deliberate — deleting them is what destroyed real user configs), so an emptied `allow` leaves the previously written grant live. Per-entry revocation works; only revocation-to-empty does not. A first attempt at this was withdrawn before release: without a record of what agentsmesh previously wrote, revocation cannot distinguish its own output from the user's, and it cleared permissions the user had authored by hand. Doing it properly needs provenance tracking.

- 6dbe626: **`generate` no longer replaces shared config files it only partly owns.**

  `generateFeature` — the emission path for rules, commands, agents, skills, MCP and ignore — was the only one that never received a merge callback, so those six features wrote whole files. Where a target's MCP output lands in a config file the user also owns, generation replaced everything else in it.

  The merge policy now lives in one module (`src/core/generate/merge-policy.ts`) used by every emission path, including the `mirrorGlobalPath` branch that previously pushed raw content with no merge at all. Key-scoped mergers were added for the files that had none:
  - **codex-cli** `.codex/config.toml` — `model`, `model_providers`, `shell_environment_policy` and `projects` trust survive; only `[mcp_servers.*]` is rewritten. The merge is text-preserving, so comments and formatting are kept.
  - **claude-code** `.mcp.json` and global `.claude.json` — agentsmesh owns `mcpServers`; the account, project and history state in `~/.claude.json` is left alone.
  - **copilot** `.vscode/mcp.json` — owns `servers`, so the `inputs` array holding secret prompts survives.
  - **deepagents-cli** `.mcp.json` — the same owned-key set as claude-code, which writes the same path.

  Servers removed from canonical are still revoked: owned keys are replaced wholesale, never deep-merged.

  Two safety rules came out of this and are now enforced by tests:
  - **A file we cannot parse is preserved, not replaced.** A `.vscode/mcp.json` or `.qwen/settings.json` containing comments is left untouched rather than rewritten without them — the rule `src/targets/zed/layout.ts` already documented. Note the run reports this as "unchanged", so generated servers are silently not applied to a JSONC file.
  - **Targets sharing an output path must own identical keys.** claude-code and deepagents-cli both write `.mcp.json`; when only one merged, `resolveOutputCollisions` failed the entire run for anyone with both enabled.

  Also fixed: a TOML table header whose quoted key contains a bracket — `[projects."/Users/me/[wo]rk"]`, a legal path — was not recognised as a header, so it stayed inside the dropped `[mcp_servers.*]` region and was deleted along with its `trust_level`.

  **Follow-up, shipped alongside this:** stale cleanup used to delete these same files whenever a run stopped emitting them. `managedOutputs.coOwnedFiles` now separates "agentsmesh owns this, delete it when stale" from "the user owns this too, never delete it" — see the co-owned managed-outputs entry.

- 9ef7c44: Bumped the `tar` production dependency to 7.5.22, clearing three advisories that ship to anyone installing agentsmesh: GHSA-23hp-3jrh-7fpw (critical — decompression/parse denial of service), GHSA-8x88-c5mf-7j5w (high — negative entry size infinite loop), and GHSA-r292-9mhp-454m (high — uncontrolled recursion in `mapHas`/`filesFilter`). `tar` backs `agentsmesh install` pack extraction.

  Also pinned repo-local resolutions for two high-severity transitives of `@modelcontextprotocol/sdk` — `fast-uri` to `^3.1.5` (GHSA-7p8r-x3mc-p8w7, host confusion via backslash) and `ip-address` to `^10.3.1` (GHSA-mwp4-54f8-5fhr, leading-zero octet decoding). These are pnpm `overrides`, so they harden this repo's own builds and CI; consumers resolve those transitives through their own package manager and are not affected by the override.

- 4d79310: Stop replacing and deleting the config files the AI tools write themselves

  Twenty-two generated paths were written from canonical alone AND listed in
  `managedOutputs.files`, the stale-cleanup delete list. Every run replaced the
  whole document — losing every key the tool or the user had put there — and any
  run that stopped emitting the path deleted the file outright.

  Confirmed end to end: a `~/.codeium/windsurf/mcp_config.json` holding a server
  added in Windsurf's MCP UI plus an unrelated top-level key came back with both
  gone.

  Each path now has a key-scoped merge hook and moved to
  `managedOutputs.coOwnedFiles`, which cleanup never reads:
  - **MCP configs** (`mcpServers` and the canonical per-server fields owned;
    `disabled`, `autoApprove`, `timeout`, `cwd` and every other top-level key
    carried over): amazon-q `.amazonq/mcp.json` + `~/.aws/amazonq/mcp.json`,
    cline `.cline/mcp.json`, codebuff `.agents/mcp.json`, cursor
    `.cursor/mcp.json`, factory-droid `.factory/mcp.json`, junie
    `.junie/mcp/mcp.json`, kilo-code `.kilo/mcp.json`, kimi-code
    `.kimi-code/mcp.json`, kiro `.kiro/settings/mcp.json`, roo-code
    `.roo/mcp.json`, rovodev `~/.rovodev/mcp_config.json`, trae `.trae/mcp.json`,
    warp `.warp/.mcp.json`, windsurf `~/.codeium/windsurf/mcp_config.json`.
  - **Hooks configs**: antigravity `.agents/hooks.json` +
    `~/.gemini/config/hooks.json` (keyed by user-chosen handler names, so the
    user's handlers now survive), codex-cli `.codex/hooks.json` (keeps the
    top-level `description`), cursor `.cursor/hooks.json`, factory-droid
    `.factory/hooks.json`, trae `.trae/hooks.json` + `~/.trae-cn/hooks.json`,
    windsurf `.windsurf/hooks.json` + `~/.codeium/windsurf/hooks.json`.
  - **Permissions and settings**: cursor `.cursor/cli.json` /
    `~/.cursor/cli-config.json` (keeps `version`, `editor`, `network`),
    factory-droid `.factory/settings.json` (agentsmesh owns only
    `commandAllowlist` / `commandDenylist`), junie `~/.junie/allowlist.json`
    (agentsmesh owns only `rules.executables`, so "Always allow" approvals in the
    other categories, plus `defaultBehavior` and `allowReadonlyCommands`,
    survive).
  - **Agents manifest**: cline `.cline/agents.yaml`, merged on the `agents` key.

  A new repo-wide invariant makes the class impossible to reintroduce silently:
  any structured config document (JSON/JSONC/TOML/YAML) left in
  `managedOutputs.files` must be named in an explicit, justified allowlist of the
  outputs agentsmesh owns outright. It runs over registered plugin descriptors as
  well as builtins.

  Paths deliberately unchanged because agentsmesh owns them end to end:
  `.continue/mcpServers/agentsmesh.json`, `.github/hooks/agentsmesh.json`,
  `.agents/plugins/agentsmesh/**`, `~/mcp_settings.json` (roo-code),
  `.windsurf/mcp_config.example.json`, `~/.claude/hooks.json` (eviction entry) and
  `.rovodev/prompts.yml`.

  **Two fixes made while verifying this sweep.**

  `mergeMcpServersJson` replaced the whole file when it could not parse the base,
  so a comment in an MCP config destroyed it — the same fail-open that
  `preservedUnparsableBase` was written to close, in a helper that never routed
  through it. It now preserves an unparsable base, and this sweep would otherwise
  have applied the destructive path to roughly twenty more files.

  `.rovodev/prompts.yml` had been classified as agentsmesh-owned. It is not: the
  importer reads it (`src/targets/rovodev/importer.ts`), which is the proof the
  user authors prompts there. It now merges per entry by the same marker
  convention Roo Code's custom modes use, and the marker algorithm — including
  the fix for the first list entry, whose comment YAML reattaches to the sequence
  node on re-parse — now lives once in `src/core/generate/yaml-list-merge.ts`
  instead of being duplicated per target.

  **Known gaps, unchanged by this release.** Managed _directories_ have the same
  problem `managedOutputs.files` had: the sweep deletes every file under a managed
  dir that the run did not emit, so a hook or prompt file the tool or user created
  in `.kiro/hooks`, `.cline/hooks` or `.rovodev/commands` is still removed. And a
  server you added in a tool's own UI and never imported is still revoked, because
  agentsmesh owns the whole `mcpServers` key and cannot tell your server from one
  it wrote itself.

## 0.32.0

### Minor Changes

- 9efbab1: Detect stale files in managed generated-output locations during `agentsmesh check`, and expose `canonicalDrift`, `outputDrift`, and `outputsStale` across CLI, programmatic, and MCP results.
- a722921: Lessons recall now escalates on repeat failures. When `agentsmesh lessons hook` runs as a `PreToolUse` first-touch guard and the exact action about to run has already failed twice or more (per the opt-in outcome log) with a captured lesson covering it, the covering rule is re-injected above the normal recall bullets as a `RECURRENT FAILURE` escalation — and it cuts through per-session dedup, since a rule the agent saw but did not apply must be shown again. Advisory context only, once per action per session; the covering rule is shown exactly once (the escalation is its delivery), and the default telemetry-off path is unaffected.

  Effectiveness telemetry is now attributed per harness session. The hook stamps the harness `session_id` (and a per-batch relevance `rank`) onto the `delivered` / `failure` rows of `.agentsmesh/lessons/outcome-log.jsonl` and onto recall telemetry, so `agentsmesh lessons stats` groups by real sessions and a failure only impeaches deliveries from its own session — no `AGENTSMESH_SESSION_ID` export needed on hook-driven recalls.

  Added an opt-in `repairTriggers` flag (default `false`) in `.agentsmesh/lessons/config.json` that repairs degraded triggers at capture time: a broad or wide `file_glob` is narrowed toward the evidence file's directory class, a stopworded or over-long keyword gets a matchable variant added beside it, and a keyword that tokenizes to nothing is dropped — each surfaced as a `NARROWED_GLOB` / `KEYWORD_VARIANT_ADDED` / `DROPPED_KEYWORD` warning on the capture result. It never blocks a capture, never rewrites a glob without covering evidence, and never leaves a lesson with zero triggers.

## 0.31.0

### Minor Changes

- 580c7ea: Aider: raise MCP, Hooks, and Permissions from none to partial.
  - **MCP (project, none → partial)**: Aider has no project-local MCP config file surface — MCP tool use is handled by Aider's own `--mcp` CLI flag or the `mcp` section of `~/.aider.conf.yml` (global user config, not a project file). `lintMcp` warns when canonical MCP servers are present but cannot be projected to the project scope. `generateMcp` returns `[]` (no-op stub satisfying the descriptor schema contract).
  - **Hooks (project, none → partial)**: Aider has no file-based lifecycle hook system for projects. Lifecycle behavior is controlled via scripting (e.g. `--script` mode) rather than a writable config surface. `lintHooks` warns when canonical hooks are present but cannot be projected. `generateHooks` returns `[]`.
  - **Permissions (project, none → partial)**: Aider has no writable permissions file in the project — tool allow/deny is configured via the `--allowed-cmds`/`--no-auto-accept-architect` CLI flags or user-global config, not a project-scope file. `lintPermissions` warns when canonical permissions are present but cannot be projected. `generatePermissions` returns `[]`.

  All three features remain `none` at global scope (Aider's `~/.aider.conf.yml` user config exists but carries no MCP-server list, hook-event list, or structured permission blocks that map faithfully from canonical form).

- b71fd29: Amazon Q: raise Hooks and Permissions from partial to embedded; add missing ledger cells for rules/project, rules/global, and mcp/global.
  - **Hooks (project + global, none → partial → embedded)**: Amazon Q agent JSON files at `.amazonq/cli-agents/*.json` support a top-level `hooks` key with triggers `agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, and `stop`. Verified at https://aws.github.io/amazon-q-developer-cli/agent-format.html. Canonical `PreToolUse`, `PostToolUse`, and `UserPromptSubmit` entries are now embedded into each generated agent JSON under the corresponding Amazon Q trigger names. `Notification`, `SubagentStart`, and `SubagentStop` have no Amazon Q equivalent — `lintHooks` warns about those events only (not about the mappable ones). `generateHooks()` is a registered no-op so the engine's dispatch path finds a generator.
  - **Permissions (project + global, none → partial → embedded)**: Agent JSON files support `allowedTools` (array of tool names) and `toolsSettings` (per-tool restrictions). Canonical `permissions.allow` maps directly to `allowedTools` and is now merged with per-agent tools (deduplicated) in each generated agent JSON. `deny` and `ask` have no Amazon Q equivalent — `lintPermissions` warns about those only when they are non-empty. `generatePermissions()` is a registered no-op.
  - **Round-trip (importer)**: `amazonQAgentMapper` now preserves the `hooks` key from imported agent JSON into canonical agent frontmatter, completing the generate → import → generate round-trip.
  - **Ledger cells (rules/project, rules/global, mcp/global)**: These three cells were absent from `capability-ledger.json` despite the descriptor declaring `rules=native` for both scopes and `mcp=native` for global scope. Added with correct paths and format metadata.
  - **Hooks/permissions ledger cells**: Updated `maxAchievable` from `partial` to `embedded` for hooks and permissions in both project and global scopes.

- 3462660: Amp: downgrade Commands to embedded, Hooks to partial, Permissions to partial; add Agents (embedded) and Ignore (partial).
  - **Commands (project + global, native → embedded)**: Amp has no declarative slash-command file format — per https://ampcode.com/manual, commands only exist via `amp.registerCommand(...)` inside a TypeScript plugin. `generateCommands()` projects each command as `.agents/skills/<name>/SKILL.md` (the same embedding `generateSkills` uses natively), so the generated output is unchanged; only the declared capability level is corrected from `native` to `embedded`.
  - **Hooks (project + global, native → partial)**: `buildAmpScopedSettings()` used to write an undocumented `"amp.hooks"` key into `.amp/settings.json`. Re-verified directly against ampcode.com/manual — the word "hooks" never appears anywhere in the manual's content. Amp's only hook-like mechanism is the plugin-based `amp.on(...)` event API (code, not a declarative settings file), which qualifies as a partial surface (the product supports via unstable/code surface). `buildAmpScopedSettings()` no longer emits `amp.hooks`, and a `lintHooks` warning fires when canonical hooks exist but cannot be projected.
  - **Agents (project + global, none → embedded)**: Agents are now projected as skills via `generateAgents()` (each agent emits `.agents/skills/am-agent-<name>/SKILL.md`), raising the ceiling from `none` to `embedded`.
  - **Ignore (project + global, none → partial)**: Amp has no dedicated ignore file and relies on `.gitignore`. Canonical ignore patterns are not projected; `lintIgnore` warns users. The ceiling is `partial` (the product supports the concept via an adjacent mechanism, but agentsmesh cannot write it).
  - **Permissions (project + global, native → partial)**: `amp.permissions` is a LEGACY key per https://ampcode.com/manual/appendix/legacy-permissions-rules.txt. Its documented schema is an array of rule objects (`[{ tool, matches, action, context }]`), which is incompatible with the canonical `{allow,deny,ask}` string-array structure. agentsmesh cannot emit a valid `amp.permissions` value; `buildAmpScopedSettings()` no longer emits the key, `mergeAmpSettings()` no longer special-cases it, and a new `lintPermissions` warning fires when canonical permissions are present. The ceiling is `partial` (the legacy surface exists but cannot be driven from canonical config).
  - Updated `src/targets/catalog/capability-ledger.json` entries for `amp/commands`, `amp/hooks`, `amp/agents`, `amp/ignore`, and `amp/permissions` across project + global scopes.

- a9698e3: Antigravity: promote commands to native (both scopes) and correct global workflows path.
  - **Commands (project + global, partial → native)**: `generateCommands()` produces `.agents/workflows/<name>.md` files and the importer reads them back from the same directory. The old `partial` declaration was incorrect — full round-trip has always been present. Global scope commands round-trip via `ANTIGRAVITY_GLOBAL_WORKFLOWS_DIR`.
  - **Global workflows path corrected**: `ANTIGRAVITY_GLOBAL_WORKFLOWS_DIR` was changed on this branch from `.gemini/antigravity/workflows` (master) to `.gemini/config/workflows` — but no primary source confirms `.gemini/config/workflows` as a valid Antigravity global workflows location. Multiple sources (GitHub Issue #16058 on google-gemini/gemini-cli and the antigravity-minimal-setup community repo) document the correct path as `~/.gemini/antigravity/global_workflows/`. The constant is now set to `.gemini/antigravity/global_workflows`. The MCP path (`.gemini/config/mcp_config.json`) and skills path (`.gemini/config/skills/`) are unaffected — both are confirmed by primary sources (Google Codelabs).
  - **Global paths summary (final state)**:
    - Rules (global): `~/.gemini/GEMINI.md` (aggregate, all rules embedded)
    - Skills (global): `~/.gemini/config/skills/`
    - Commands/workflows (global): `~/.gemini/antigravity/global_workflows/`
    - MCP (global): `~/.gemini/config/mcp_config.json`
    - Hooks (global): `~/.gemini/config/hooks.json`

- 91d3885: Augment Code: raise global Hooks from none to native.
  - **Hooks (global, none → native)**: `~/.augment/settings.json` supports the same `hooks` key as the project-scope `.augment/settings.json` — the `buildSettingsContent` helper already serialises canonical hooks into AugmentCode's native format (`{ event: [{ matcher, hooks: [{ type, command, timeout }] }] }`), and `importAugmentSettings` already reads them back. The global capability was previously declared `none` even though generation and import were already wired. Only the `globalCapabilities.hooks` declaration needed to change from `none` to `native`; no code changes were required.
  - **Project hooks (native — unchanged)**: project-scope hooks were already `native` and are unaffected.

- 5369c3b: Add a capability provenance ledger (`src/targets/catalog/capability-ledger.json`) plus deterministic `pnpm capabilities:audit` / `capabilities:seed` and a CI conformance test that validates each target's generated files against a recorded path/extension/structure fingerprint. Reworks the `update-target-capabilities` skill to an audit-driven flow.
- 1991a3f: `agentsmesh check` now detects drift in generated outputs. `agentsmesh generate` records a checksum for every generated file in a new `outputs` map inside `.agentsmesh/.lock` (full runs replace the map; `--targets`/`--features` runs merge per-path), and `check` re-hashes those files, failing with exit code 1 when a generated output was hand-edited or deleted. JSON output gains `outputsModified`, `outputsRemoved`, and `outputsChecked` alongside the existing canonical-drift fields, so the two drift kinds are reported separately. A new `check --no-outputs` flag skips output verification (for setups that gitignore generated outputs in CI). Locks written by earlier versions skip output verification with a hint until the next `generate` upgrades them. The MCP `check` tool performs the same output verification. Checksums are BOM- and line-ending-normalized, so CRLF-only editor rewrites do not register as drift.
- 0fa6069: Cline: rebase on the standalone CLI's documented paths (docs.cline.bot/cli/cli-reference) instead of the VS Code extension's IDE-era layout, raise Permissions, and downgrade unsupported global surfaces.
  - **Rules (project + global, native — fixed)**: project rules move from `.clinerules/{slug}.md` to `.cline/rules/{slug}.md`; global rules move from `~/Documents/Cline/Rules/` to `~/.cline/data/settings/rules/`. The legacy flat-file `.clinerules` convention (no directory) is dropped — it is undocumented for the CLI; only the directory form is imported. Root-rule detection order is unchanged: `_root.md`, then `AGENTS.md`, then the first alphabetically-sorted rule file.
  - **Hooks (project + global, native — fixed)**: hooks move from `.clinerules/hooks/*.sh` to `.cline/hooks/*.sh`. Project and global scope now resolve to the identical relative path (project root vs. `$HOME`), matching the CLI's documented `~/.cline/hooks` default (also configurable via `--hooks-dir`/`CLINE_HOOKS_DIR`) — the importer reads a single directory instead of merging two.
  - **MCP (project, native — fixed)**: the settings file moves from `.cline/cline_mcp_settings.json` to `.cline/mcp.json`. Both the old filename and `.cline/mcp_settings.json` are still accepted on import for backward compatibility.
  - **MCP (global): native → none**. No global MCP config path is documented anywhere in the CLI reference's `~/.cline/data/settings/` tree; `.cline/mcp.json` is project-only.
  - **Skills (global, native — fixed)**: global skills move from the project-identical `.cline/skills/` to the documented `~/.cline/data/settings/skills/`.
  - **Agents (project, native — fixed)**: generator now writes a single combined `.cline/agents.yaml` (the CLI-documented surface: "Agent definitions") instead of per-agent `.cline/agents/<name>.md` files (the undocumented per-file format used by earlier agentsmesh versions). The YAML file has a top-level `agents:` list; each entry uses a round-trippable `name`/`description`/`model`/`tools`/`prompt` shape plus the same `x-agentsmesh-*` extension keys used by other native-agent targets. The importer now reads `.cline/agents.yaml` as the primary format and falls back to the legacy `.cline/agents/<name>.md` directory for backward compatibility. Because `.cline/agents.yaml` is a combined file, `agentPath()` returns `null` at project scope (no per-name destination for cross-reference rewriting) — the same pattern used by roo-code's `.roomodes`.
  - **Agents (global): native → none**. No `agents.yaml` or `agents/` directory is documented anywhere under `~/.cline/data/settings/` — only `providers.json`, `rules/`, and `skills/`.
  - **Ignore (global): native → none**. docs.cline.bot/customization/clineignore documents `.clineignore` as strictly per-workspace-root (each monorepo workspace root can have its own); no global/home-directory ignore file exists.
  - **Permissions (project + global): none → partial**. Cline has no dedicated writable permissions file in either scope — approval is controlled via the `--auto-approve` CLI flag, the `CLINE_COMMAND_PERMISSIONS` environment variable (JSON allow/deny command-glob policy), or the extension UI's Auto Approve/YOLO Mode. A no-op generator stub plus a lint warning point users at these mechanisms directly.

  Commands (workflows) are unaffected by this change and remain at the pre-existing `.clinerules/workflows/` (project) and `~/Documents/Cline/Workflows/` (global) paths — the CLI reference does not document a workflows/commands surface, so this IDE-era path is left as-is.

- 8cae45c: Codex CLI: raise Permissions to native and fix broken AdditionalRules/Hooks/MCP.
  - **Permissions (project + global): none → native**. Canonical `allow`/`ask`/`deny` command patterns now project onto `.codex/rules/agentsmesh-permissions.rules`, Codex's real Starlark `prefix_rule(pattern, decision, justification)` execution-policy DSL (allow → `allow`, ask → `prompt`, deny → `forbidden`), per https://developers.openai.com/codex/rules. `Bash(<command>[:*])` entries get a real, enforceable `prefix_rule`; every entry (including non-Bash ones like `Read`/`WebFetch`, which have no Codex command-execution equivalent) is also recorded as a `# agentsmesh-permission <decision>: <pattern>` marker comment so import recovers the exact canonical string losslessly. Uses a dedicated filename distinct from both per-rule `{slug}.rules` execution files and Codex's own `default.rules` TUI-write destination, so nothing double-writes or collides. `.codex/config.toml`'s `sandbox_mode`/`approval_policy`/`[permissions.<name>]` schema is real but has no faithful, round-trippable mapping from canonical allow/deny/ask command patterns, so it is intentionally not used here.
  - **AdditionalRules (project, native — fixed)**: scoped/non-root advisory rules now generate real nested `<dir>/AGENTS.md` (or `AGENTS.override.md`) files that Codex's documented root-to-cwd directory walk actually loads, instead of `.codex/instructions/{slug}.md` (not part of Codex's instruction-loading hierarchy) plus a link-only index in the root `AGENTS.md`. `{dir}` is the first glob's directory prefix, falling back to the rule's slug when no glob yields one (no globs, root-wildcard globs, traversal/absolute/brace-ambiguous globs). Multiple rules resolving to the same directory are joined into one file. The old `.codex/instructions/` mirror is still imported for backward compatibility with repos generated by older agentsmesh versions.
  - **Hooks (project + global, native — fixed)**: canonical `Notification` hooks are no longer written to `hooks.json` — Codex's real lifecycle events are `SessionStart`, `SubagentStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop` (https://learn.chatgpt.com/docs/hooks); there is no `Notification` event, so it silently never fired. A new lint warning flags any unsupported event. The shared `buildWrappedCommandHooks` helper (also used by factory-droid and goose) gained an optional `supportedEvents` filter, defaulting to unfiltered so those targets are unaffected.
  - **MCP (project, native — fixed)**: `.codex/config.toml`'s `[mcp_servers.<name>]` now supports Codex's remote/Streamable HTTP transport (`url`, `bearer_token_env_var`, `http_headers`, per https://developers.openai.com/codex/mcp) on both the generator and importer side. Previously the importer required `command` and silently dropped every URL-based server, and the generator only ever emitted stdio servers. A `bearer_token_env_var` round-trips through the canonical `Authorization: Bearer ${VAR}` header convention. The stale "codex-cli only generates stdio MCP servers" lint warning is replaced with one that only fires when a remote server has env vars (which codex-cli still can't project).

- cec0e7a: Continue: raise ignore from partial to native for both project and global scopes — generate and import `.continueignore` and `~/.continue/.continueignore`.
  - **Ignore (project, partial → native)**: agentsmesh now generates `.continueignore` at the project root from canonical ignore patterns (gitignore format, one pattern per line). Import reads `.continueignore` back into `.agentsmesh/ignore`. Verified against the official Continue docs: "If you'd like to exclude additional files, you can add them to a `.continueignore` file, which follows the exact same rules as `.gitignore`." (docs.continue.dev/reference/deprecated-codebase)
  - **Ignore (global, partial → native)**: agentsmesh now generates `~/.continue/.continueignore` from canonical ignore patterns in global mode. Import reads it back into `.agentsmesh/ignore`. Verified: "Continue also supports a global `.continueignore` file that will be respected for all workspaces, which can be created at `~/.continue/.continueignore`." (docs.continue.dev/reference/deprecated-codebase)
  - The `lintIgnore` warning that told users to configure ignore manually is removed — generation handles it natively.
  - The global importer now correctly propagates the `scope` parameter to `runDescriptorImport` (was hardcoded to `'project'`), enabling scope-correct path resolution for all descriptor-driven imports.

- df5bf44: GitHub Copilot: raise global MCP/Hooks to native, permissions to partial, fix the project-scope hooks matcher bug, and drop the phantom global commands surface.
  - **MCP (global): none → native**. `~/.copilot/mcp-config.json` (`mcpServers` key — distinct from the project-scope `.vscode/mcp.json` `servers` key) now round-trips canonical MCP servers via generator + importer, wired through `globalSupport.scopeExtras` (per https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers). The prior ledger cell for this cell pointed at the OS-specific VS Code user-profile `mcp.json` (`~/.config/Code/User/mcp.json`, `servers` key) — that models the VS Code extension's own config, not this target's `~/.copilot`-based global scope (every other global path here — `copilot-instructions.md`, `agents/`, `skills/` — lives under `~/.copilot`), so the ledger cell is corrected to Copilot CLI's own path/key.
  - **Hooks (global): none → native**. `~/.copilot/hooks/agentsmesh.json` (+ wrapper scripts under `~/.copilot/hooks/scripts/`) uses the exact same `{version, hooks}` schema as project scope (https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks), wired independently via `scopeExtras` so the project-shaped generator never leaks into global paths.
  - **Permissions (global): none → partial**. `~/.copilot/permissions-config.json` records saved tool/directory approvals, but per https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference it has no deny rules, ask rules, default modes, URL rules, tool filtering, or repository-local shared policy — capped at `partial` with a lint warning rather than a generator that would overclaim control.
  - **Commands (global): native → none**. Global commands were generated to `.copilot/prompts/{name}.prompt.md`, but no real Copilot surface reads that path: Copilot CLI has no prompt-file/slash-command mechanism at all (maintainer, github/copilot-cli#618, closed: "we do not plan on supporting prompt files"; confirmed absent from the official `~/.copilot` config-dir reference), and VS Code Copilot Chat's own user-level prompt files live in the OS-specific VS Code profile folder, not `~/.copilot`. The phantom path is no longer generated or imported in global scope; project-scope commands (`.github/prompts/*.prompt.md`, a real VS Code Copilot Chat workspace surface) are unaffected.
  - **Hooks (project, native — fixed)**: `generateHooks` now emits the real top-level `matcher` regex field (https://docs.github.com/en/copilot/reference/hooks-configuration) instead of a non-functional `comment: "Matcher: ..."` field, so hooks actually filter by tool instead of firing unconditionally for every tool. The canonical `'*'` wildcard sentinel is omitted (Copilot compiles `matcher` as `^(?:PATTERN)$`, and `"*"` alone is an invalid regex that would cause the whole entry to be skipped). The importer prefers the real field, falling back to the legacy comment for previously-generated files. (Re-verification note: the research pass also flagged canonical `Notification` hooks as unsupported by Copilot — that does not hold up against the current docs, which document `notification` as a real, supported hook event; no change was made there.)

- 944efc2: Crush: raise Commands to embedded, Permissions to native (project + global); fix generator key, add permissions round-trip importer.
  - **Commands (project + global): none → embedded**. Canonical commands are projected as skill bundles under `.crush/skills/am-command-<name>/SKILL.md` (with `x-agentsmesh-kind: command` frontmatter) via `serializeCommandSkill`. Crush has no native slash-command file format; embedded projection via `supportsConversion` is the correct level. Import recovers commands through `importEmbeddedSkills`.
  - **Permissions (project + global): partial/none → native**. Canonical `allow` list maps to `permissions.allowed_tools` and `deny` list maps to `options.disabled_tools` in `crush.json` — both confirmed against the official crush schema.json (`charmbracelet/crush`) and `internal/config/config.go` (`Permissions.AllowedTools`, `Options.DisabledTools`). The generator previously wrote `permissions.denied_tools` (a non-existent field); this is corrected to `options.disabled_tools`. A new `parseCrushPermissions` function in the importer reads both fields back into canonical `permissions.yaml`, completing the native round-trip for both project scope (`crush.json`) and global scope (`~/.config/crush/crush.json`).
  - **Generator fix**: `generatePermissions` now correctly emits deny-list entries under `options.disabled_tools` instead of the non-existent `permissions.denied_tools` key.
  - **Lint comment updated**: file-level comment in `lint.ts` updated to reflect native support and the correct field names.

- 45684bd: Cursor: raise permissions to native in both scopes, fix global path to `~/.cursor/cli-config.json`.
  - **Permissions (project, native)**: canonical `allow`/`deny` entries are now written to `.cursor/cli.json` (project root) and imported back, completing the round-trip. The output format is `{ "permissions": { "allow": [...], "deny": [...] } }` per the official Cursor CLI docs.
  - **Permissions (global, native — path fix)**: global scope now correctly writes to `.cursor/cli-config.json` (resolved as `~/.cursor/cli-config.json`), distinct from the project-scope `.cursor/cli.json`. The previous implementation used `.cursor/cli.json` for both scopes, landing permissions at `~/.cursor/cli.json` — an undocumented path that Cursor does not read. Source: https://cursor.com/docs/cli/reference/permissions.
  - **lintPermissions removed**: the stale `'Cursor permissions are partial; tool-level allow/deny may lose fidelity.'` warning no longer fires. Cursor permissions are fully round-trippable at the `native` level; emitting a partial warning was factually incorrect after the capability upgrade.
  - **Importer (global scope)**: `importSettings` now reads from `.cursor/cli-config.json` when called in global scope, matching the generate path.

- cc7de10: Deep Agents CLI: fix per-agent global paths, raise Agents to native and Commands to embedded, downgrade project Hooks to none.
  - **Hooks (project, native → none)**: docs.langchain.com/oss/javascript/deepagents/code/hooks documents only the global `~/.deepagents/hooks.json` — there is no project-level hooks surface at all. `generateHooks()` is removed from the project generator; project `capabilities.hooks` is now `none`, with a `lintHooks` warning when canonical hooks exist but can't be projected.
  - **Hooks (global, native, broken-fix)**: the generator wrote the Claude-Code-style `{EventName: [{matcher, hooks:[...]}]}` shape, which Deep Agents Code never reads — the real schema is a flat `{"hooks":[{"command":[...], "events":[...]}]}` array with its own dotted event vocabulary (`session.start`, `task.complete`, …). Added `hooks-format.ts` (canonical ⇄ Deep Agents event mapping, limited to the 5 events with an honest 1:1 match — `SessionStart`/`SessionEnd`/`UserPromptSubmit`/`Stop`/`PreCompact`) and moved generation to `globalSupport.scopeExtras` (gated on `scope === 'global'`) so it never leaks into project scope. Added a matching importer (`importDeepagentsCliGlobalHooks`) — hooks previously had no round-trip at all.
  - **Agents (project + global, none → native)**: `.deepagents/agents/{name}/AGENTS.md` (project) and `~/.deepagents/{agent}/agents/{name}/AGENTS.md` (global) are a dedicated on-disk subagent surface, distinct from skills — previously agentsmesh only projected agents as skills (`am-agent-*`). Added a native generator/importer (`agent-format.ts`) emitting the documented frontmatter (`name`, `description`, optional `model`) instead of the richer Claude-Code-style fields no Deep Agents subagent reads.
  - **Commands (project + global, none → embedded)**: no dedicated command file format exists; commands are (and already were) projected as skills via the existing `am-command-*` mechanism. Only the declared capability level was wrong — output is unchanged.
  - **Global paths (broken-fix)**: global rules/skills/agents were generated to the exact same flat paths as project scope (`.deepagents/AGENTS.md`, `.deepagents/skills/`) instead of the documented per-agent-instance directory `~/.deepagents/{agent}/...` (default instance name `"agent"`). Fixed via `DEEPAGENTS_CLI_DEFAULT_AGENT_NAME` threaded through the global constants — global root/skills/agents now resolve under `.deepagents/agent/...`. MCP (`.mcp.json`) and hooks (`hooks.json`) are unaffected — both are flat, unscoped globals per the docs.
  - Updated `src/targets/catalog/capability-ledger.json`: added confirmed cells for `hooks/global`, `rules/global`, `skills/global`, `agents/project`, `agents/global`, `commands/project`, `commands/global`; `hooks/project` marked `rejected`.

- 969b4a4: Factory Droid: fix hooks output path regression and raise permissions to native.
  - **Hooks (project + global, native — path corrected)**: The primary hooks surface is `.factory/hooks.json` (project) and `~/.factory/hooks.json` (global) per the official Factory Droid reference docs (`docs.factory.ai/reference/hooks-reference`). The branch had regressed this to `.factory/settings.json` (only a documented fallback when `hooks.json` is absent), which would cause generated hooks to be silently ignored whenever a real `hooks.json` exists. The generator, importer, constants, and managed-outputs arrays are restored to target `.factory/hooks.json` as the primary surface.
  - **Permissions (project + global): partial → native**. `commandAllowlist` and `commandDenylist` are documented top-level keys of `.factory/settings.json` at both project and global scope (plain JSON, not GUI-only or cloud-managed). A new `generatePermissions` generator writes canonical `allow` → `commandAllowlist` and `deny` → `commandDenylist`; a new `importFactoryDroidPermissions` helper reads them back into `.agentsmesh/permissions.yaml`. The misleading lint warning (which directed users to manually edit the file we now generate) is removed.
  - **`.factory/settings.json`** is now the dedicated permissions file; **`.factory/hooks.json`** is the dedicated hooks file. Both are tracked in `managedOutputs.files`.

- b4b78f5: Gemini CLI: upgrade hooks from partial to native and extend canonical↔Gemini hook event mapping to all supported events.
  - **Hooks (project + global): partial → native**. Gemini CLI reads hooks natively from `.gemini/settings.json` (project) and `~/.gemini/settings.json` (global), confirmed against upstream `settingsSchema.ts`. Both scopes are file-writable with full round-trip support.
  - **Extended hook event mapping**: the generator and importer previously mapped only 3 events (PreToolUse↔BeforeTool, PostToolUse↔AfterTool, Notification↔Notification). Gemini CLI's schema defines 11 hook events; 6 now have canonical equivalents and are fully wired:

    | Canonical (agentsmesh) | Gemini CLI             |
    | ---------------------- | ---------------------- |
    | `PreToolUse`           | `BeforeTool`           |
    | `PostToolUse`          | `AfterTool`            |
    | `Notification`         | `Notification`         |
    | `SubagentStart`        | `BeforeAgent` _(new)_  |
    | `SubagentStop`         | `AfterAgent` _(new)_   |
    | `SessionStart`         | `SessionStart` _(new)_ |

    The 5 Gemini-only events (`SessionEnd`, `PreCompress`, `BeforeModel`, `AfterModel`, `BeforeToolSelection`) have no canonical equivalent and are silently dropped on import, as before for any unmapped event. The lint `supported` list is updated to match; `SubagentStart`, `SubagentStop`, and `SessionStart` no longer produce spurious unsupported-event warnings.

- 27799dd: Goose: raise commands/agents to embedded, mcp/permissions to partial, fix lintMcp scope-gate.
  - **commands (project + global): none → embedded**. Canonical commands are projected as Goose skills under `.agents/skills/<name>/SKILL.md` with `name`/`description` frontmatter, discoverable by Goose's skills system at both project and global (`~/.agents/skills/`) scope.
  - **agents (project + global): none → embedded**. Canonical agents are projected as skills under `.agents/skills/<agent-name>/SKILL.md`, consistent with the commands projection path.
  - **mcp (project): none → partial**. Goose has no per-project MCP config file; all MCP extensions live in `~/.config/goose/config.yaml` (global, native). A lint warning is emitted when canonical MCP servers are present at project scope, directing users to configure extensions globally via `goose configure`.
  - **permissions (project): none → partial**. Goose tool permissions live exclusively in `~/.config/goose/permission.yaml` (global, native). A lint warning is emitted when canonical permissions are present at project scope.
  - **lintMcp scope-gate (bug fix)**. `lintMcp` previously accepted no `options` argument and always emitted a "project-level MCP is not projected" warning, even at global scope where MCP is native. The function now matches the `lintPermissions` pattern: it accepts `options?: unknown`, reads `scope` via narrowing, and returns `[]` at global scope.

- ac93729: Jules: raise Commands, MCP, Hooks, Ignore, and Permissions from none to partial; fix engine ignore-dispatch gap.
  - **Commands (project, none → partial)**: Jules has no slash-command or prompt-file mechanism. Tasks are submitted via GitHub issues or the web UI. No commands config file surface exists. `lintCommands` warns when canonical commands are present but cannot be projected.
  - **MCP (project, none → partial)**: No MCP configuration surface is mentioned anywhere in Jules documentation. Jules is cloud-hosted with no writable file surface for MCP. `lintMcp` warns when canonical MCP servers are present but cannot be projected.
  - **Hooks (project, none → partial)**: Jules has no lifecycle hook system. It is async and cloud-based with no local hook execution mechanism. `lintHooks` warns when canonical hooks are present but cannot be projected.
  - **Ignore (project, none → partial)**: Jules has no dedicated ignore file (no `.julesignore` or similar surface). It is a cloud agent with no local ignore mechanism. `lintIgnore` warns when canonical ignore patterns are present but cannot be projected.
  - **Permissions (project, none → partial)**: Jules has no permissions configuration file. Permission-like controls exist only via GitHub PR review workflows (GUI), not a writable file. `lintPermissions` warns when canonical permissions are present but cannot be projected.
  - **Engine fix — ignore dispatch gap (linter.ts)**: `descriptor.lint?.ignore` was never dispatched by the engine. The `lintSilentFeatureDrops` guard only fires for `capability.level === 'none'`, so promoting ignore from `none` to `partial` silently dropped the only warning path. The engine now dispatches `descriptor.lint?.ignore` when the `ignore` feature is enabled, matching how commands, mcp, permissions, and hooks are dispatched. This fix applies to all targets with `ignore: 'partial'` and a `lint.ignore` hook.

  All primary-doc claims verified against https://jules.google/docs.

- 5dcf731: fix(junie): correct allowlist.json schema, raise hooks/global to embedded, raise permissions/project to partial

  **Breaking fix — allowlist.json schema correction (permissions/global)**

  `generatePermissions` previously emitted `rules` as a flat array of
  `{type, name, behavior}` objects. The real `~/.junie/allowlist.json` schema
  requires `rules` to be an object with four categorized sub-keys
  (`fileEditing`, `executables`, `mcpTools`, `readOutsideProject`), each
  containing a `rules` array of `{prefix|pattern, action}` items — no `type`,
  `name`, or `behavior` field exists anywhere in the real schema. The old output
  was silently ignored by Junie, making all permission rules non-functional.
  Canonical allow/deny/ask entries are now mapped to the `executables` category
  using `prefix` (literal) or `pattern` (glob) fields with `action: allow|ask`
  (Junie has no deny action; deny is mapped to ask as the safe equivalent).

  **hooks/global raised: partial → embedded**

  `~/.junie/config.json` is a writable multi-feature file with a top-level
  `hooks` key that Junie auto-loads. Hooks are now folded into this file via
  `emitScopedSettings`. A `mergeGeneratedOutputContent` hook preserves
  pre-existing keys (model, provider, brave, mcp-locations, etc.) on
  regeneration. The lint warning for project-scope hooks (which require
  `--config-location` and are ignored from the default project config file for
  safety) is preserved.

  **permissions/project raised: none → partial**

  `.junie/config.json` at project scope exposes a `brave` boolean (auto-approve
  mode). This is a coarse project-level permission control. A `lintPermissions`
  warning is now emitted when granular allow/deny/ask rules are configured,
  explaining that only the `brave` flag is available at project scope.

  **generator.ts split**

  Global-scope config emitters (`generatePermissions`, `emitJunieScopedSettings`,
  `mergeJunieConfig`) moved to a new `global-config.ts` module to keep both
  files under 200 lines.

- 41fd095: Kilo Code: fix broken global-scope capabilities, downgrade global Ignore, raise Hooks to partial.
  - **Rules / AdditionalRules / Commands / Agents (global, native — fixed)**: global-scope paths now point at the documented `~/.config/kilo/` unified config directory instead of the old `~/.kilo/` mirror. Per https://kilo.ai/docs/getting-started/settings, kilo reads global config from `~/.config/kilo/kilo.jsonc` (and its sibling `~/.config/kilo/AGENTS.md`), not `~/.kilo/`. Root rule → `~/.config/kilo/AGENTS.md` (https://kilo.ai/docs/customize/custom-instructions); commands → `~/.config/kilo/commands/*.md` (https://kilo.ai/docs/customize/workflows); agents → `~/.config/kilo/agents/*.md` (https://kilo.ai/docs/customize/custom-subagents — note `custom-modes.md` inconsistently shows a singular `agent/` in three spots, but the dedicated `custom-subagents.md` page states plural `agents/` in its Configuration Precedence list, Method 2 directory list, and legacy-migration note; treated as authoritative). Additional (non-root) rules are now also registered under the `instructions` key of the shared `kilo.jsonc` (https://kilo.ai/docs/customize/custom-rules) — a bare `.kilo/rules/`-style directory is not auto-loaded at global scope, only `AGENTS.md` is. Global Skills were re-verified and are unchanged: `~/.kilo/skills/` is the correct, currently-documented location (https://kilo.ai/docs/customize/skills), separate from the `~/.config/kilo/` migration.
  - **MCP (global, native — fixed)**: MCP servers now fold into the `mcp` key of the shared `~/.config/kilo/kilo.jsonc` (https://kilo.ai/docs/automate/mcp/using-in-kilo-code) using kilo's own schema (`{ type: "local"|"remote", command: [...], environment, url, headers }`), instead of a standalone `~/.kilo/mcp.json` with the unrelated `mcpServers` wrapper kilo does not read at global scope. A new `importGlobalKiloMcp()` reads it back. `mergeKiloConfig` now overlays `instructions` and `mcp` alongside the existing `permission` key so permissions, rules, and MCP writes to the same file compose correctly across one generate run (`pending?.content ?? existing` base, per this repo's settings-merge-discipline rule).
  - **Ignore (global): native → none**. `~/.kilocodeignore` is no longer generated or imported. Per https://kilo.ai/docs/customize/context/kilocodeignore, `.kilocodeignore` is documented as a workspace-root-only file (patterns evaluated relative to the workspace root, auto-migrated into project-scope `permission` deny-rules) — there is no global ignore file or `kilo.jsonc` key.
  - **Hooks (project + global, none → partial)**: Kilo Code hooks are supported via auto-loaded plugin files at `.kilo/plugin/*.{ts,js}` (and their global equivalents), not via a writable config surface. agentsmesh cannot generate plugin code from canonical hook definitions. `lintHooks` warns when canonical hooks are present and directs users to author plugin files manually. No hook file is generated at either scope.
  - Updated `src/targets/catalog/capability-ledger.json`: added confirmed `kilo-code` global cells for `rules`, `additionalRules`, `commands`, `agents`, `skills`, and `mcp`; added a rejected `kilo-code/ignore/global` cell recording the downgrade rationale.

- 054ff57: kiro: migrate hook schema to v1, raise hooks/global and permissions to partial
  - Hook JSON schema migrated from deprecated beta format (`version:"1"`, `when`/`then`, `askAgent`/`shellCommand`) to the current Kiro v1.0.0 format (`version:"v1"`, top-level `hooks` array, `trigger`/`action` with `agent`/`command` types). Old-format hooks are no longer active in Kiro IDE v1.0.0+.
  - Hook file extension renamed from `.kiro.hook` to `.json` (Kiro v1.0.0 requires `.json`).
  - `globalCapabilities.hooks` raised from `none` to `partial` (global ~/.kiro/hooks/ path does not exist; hooks are workspace-only).
  - `globalCapabilities.permissions` raised from `none` to `partial` (Kiro v3 CLI exposes `~/.kiro/settings/permissions.yaml`; agentsmesh does not yet generate it).
  - `capabilities.permissions` (project scope) raised from `none` to `partial` (workspace permissions live at `~/.kiro/workspace-roots/<hash>/permissions.yaml`, outside the repo).
  - `lintPermissions` added: emits a warning when canonical permissions are non-empty, directing users to configure permissions manually.

- 27f3a61: OpenCode: fix broken AdditionalRules and Agents, raise Hooks and Ignore to partial.
  - **AdditionalRules (project + global, native — fixed)**: `.opencode/rules/<slug>.md` files are now also declared in `opencode.json`'s `instructions` array (project: `.opencode/rules/*.md`; global: an absolute `~/.config/opencode/rules/*.md`). Per https://opencode.ai/docs/rules/, OpenCode does not auto-scan any rules directory — only `AGENTS.md`/`CLAUDE.md` auto-discover via directory traversal, and every other instruction file needs an explicit `instructions` entry. Previously the generated rule files were invisible to stock OpenCode.
  - **Engine gate fix (core)**: `generateScopedSettingsFeature` was only invoked when at least one of `mcp`, `ignore`, `hooks`, `agents`, or `permissions` was enabled — `rules` was absent from the gate condition. With `features: ['rules']` alone (no other features), `emitOpenCodeScopedSettings` was never reached, so the `instructions` glob was never written to `opencode.json`. The gate now also fires when `hasRules` is true, making the instructions entry visible again for rules-only configs.
  - **Agents (project + global, native — fixed)**: `.opencode/agents/<slug>.md` now emits a real `permission` object (e.g. `permission: { edit: deny }`) mapped from canonical `tools`/`disallowedTools`, instead of `tools`/`disallowedTools` frontmatter keys. Per https://opencode.ai/docs/agents/, OpenCode has no `disallowedTools` key at all, and `tools` is deprecated ("Prefer the agent's permission field") and takes a boolean-map shape, not a string array — both emitted keys were silently non-functional. The importer now translates an imported `permission` object back into canonical `tools`/`disallowedTools` so the restriction round-trips (categorically, not by original tool name).
  - **Fix (opencode.json merge)**: `mergeOpenCodeSettings` previously delegated to the generic Claude-shaped settings merger, which only ever carried over `permissions`(plural)/`hooks` from freshly generated content — silently freezing `mcp`/`permission`/`instructions` at whatever a first `generate` wrote, on every subsequent regenerate. It now merges OpenCode's own `mcp`/`permission`/`instructions` keys directly.
  - **Hooks (project, none → partial)**: OpenCode hooks are plugin-based TypeScript/JavaScript lifecycle events (`.opencode/plugins/`), not a writable config surface that agentsmesh can generate. `lintHooks` warns when canonical hooks are present, directing users to author plugins manually. No hook file is generated.
  - **Ignore (project, none → partial)**: OpenCode's ignore configuration lives under the `watcher.ignore` key of `opencode.json` rather than a standalone file, and mapping canonical glob-patterns to that key has no clean round-trip. `lintIgnore` warns when canonical ignore patterns are present, directing users to configure `watcher.ignore` manually. No ignore file is generated.

- 27c977f: Correct pi-agent capability levels based on primary-source verification of the earendil-works/pi repository.
  - `mcp` (project + global): `partial` → `none`. A full recursive tree scan of the earendil-works/pi repository finds zero MCP-related source files. Pi has no native MCP config file surface — neither at project scope (`.pi/`) nor global scope (`~/.pi/agent/`). The extension system supports custom TypeScript tools and lifecycle events but not the MCP protocol. Declaring `partial` was inaccurate; `none` re-enables the silent-drop guard. The `lintMcp` stub (which falsely claimed MCP was managed via `extensions`) is removed.
  - `hooks` (project + global): `none` → `partial`. Pi Agent lifecycle hooks are supported via TypeScript extensions auto-discovered from `.pi/extensions/` (project) and `~/.pi/agent/extensions/` (global). These are hand-authored code files, not a writable config surface, which justifies `partial`. A `lintHooks` warning is emitted when canonical hooks are present.
  - `ignore` (project + global): `none` → `partial`. Pi has no dedicated ignore file; it relies on `.gitignore`. A `lintIgnore` warning is emitted to inform users that canonical ignore patterns are not projected.
  - `permissions` (project + global): `none` → `partial`. Pi has no built-in permissions config; permissions can be implemented via extension hooks. A `lintPermissions` warning is emitted when canonical permissions are present.

- c24a762: Qwen Code: raise global AdditionalRules to native and fix broken rule/command frontmatter keys.
  - **AdditionalRules (global, embedded → native)**: non-root rules now generate real files under `~/.qwen/rules/<slug>.md` instead of being folded into `~/.qwen/QWEN.md`'s body. Qwen Code's `loadRules()` (`rulesDiscovery.ts`) reads `.qwen/rules/` recursively from **both** the global `~/.qwen` dir and the project dir with the identical mechanism, so there's no reason to embed. A new `QWEN_GLOBAL_RULES_DIR` constant, global layout rewrite, and importer-spec global source wire this up; the now-unused `renderQwenGlobalInstructions` embedding helper is removed.
  - **AdditionalRules (project + global, native — fixed)**: the emitted frontmatter key for path-scoped rules changes from `globs:` to `paths:` in `.qwen/rules/<slug>.md`. Qwen Code's `parseRuleFile()` only recognizes `paths:` for conditional (turn-level lazy) rule injection — `globs:` was never read, so any canonical rule with path-scoping silently became an always-injected baseline rule. The importer's `frontmatterRemap` now maps the on-disk `paths:` key back to the canonical `globs` field so round-tripping still works.
  - **Commands (project + global, native — fixed)**: the generator no longer emits `allowed-tools` into `.qwen/commands/<name>.md` frontmatter. Qwen Code's `MarkdownCommandDefSchema` (`markdown-command-parser.ts`) only maps `description`, `argument-hint`, `when_to_use`, and `disable-model-invocation` — there is no tool-restriction field, so the value was silently ignored. A new `lintCommands` warning flags canonical commands with non-empty `allowedTools` for this target.

  Source: https://github.com/QwenLM/qwen-code/blob/main/packages/core/src/utils/rulesDiscovery.ts, https://github.com/QwenLM/qwen-code/blob/main/packages/cli/src/services/markdown-command-parser.ts, https://github.com/QwenLM/qwen-code/blob/main/packages/cli/src/services/FileCommandLoader.ts

- 73b4872: replit-agent: raise MCP, Hooks, Ignore, and Permissions from none to partial; add no-op generator stubs to satisfy schema contract.
  - **MCP (project, none → partial)**: Replit Agent MCP servers are configured exclusively via the Integrations UI pane, not via any project-local file. `lintMcp` warns when canonical MCP servers are present but cannot be projected. `generateMcp` is a no-op stub (returns `[]`) satisfying the descriptor schema contract.
  - **Hooks (project, none → partial)**: Replit Agent has no lifecycle hook file surface. Hook state transitions (Draft, Active, Queued, etc.) are internal platform states, not user-writable hooks. `lintHooks` warns when canonical hooks are present but cannot be projected. `generateHooks` is a no-op stub (returns `[]`).
  - **Ignore (project, none → partial)**: Replit Agent has no dedicated ignore file (no `.replitignore` or similar). The agent relies on `.gitignore` for version-control purposes, but no Replit-specific file-based ignore surface exists. `lintIgnore` warns when canonical ignore patterns are present but cannot be projected. `generateIgnore` is a no-op stub (returns `[]`).
  - **Permissions (project, none → partial)**: Replit Agent permissions are managed in the cloud UI with no writable file surface in the project. `lintPermissions` warns when canonical permissions are present but cannot be projected. `generatePermissions` is a no-op stub (returns `[]`).

  All primary-doc claims verified against https://docs.replit.com/references/mcp/overview, https://docs.replit.com/replitai/agent, https://docs.replit.com/references/agent/task-lifecycle, and https://docs.replit.com/replitai/replit-dot-md.

- d715e69: Roo Code: fix broken capabilities and correct mislabeled support levels.
  - **Agents (project, native — fixed)**: `.roomodes` custom modes now include a `groups` array (mapped from canonical agent `tools`) and always a non-empty `roleDefinition`. Roo Code's `modeConfigSchema` requires both fields with no default — omitting either made `CustomModesManager.loadModesFromFile()` silently drop every mode in the file.
  - **Agents (global, partial — fixed)**: the settings file now writes to `~/.roo/settings/custom_modes.yaml` (was missing the `.roo/` prefix, i.e. `~/settings/custom_modes.yaml`) and carries the same `groups`/`roleDefinition` fix. Stays `partial`: Roo Code's real read path is a non-deterministic per-OS/per-fork VS Code extension `globalStorage` directory that `--global` cannot resolve deterministically.
  - **Rules (global, native — fixed)**: the root rule now stays at `~/.roo/rules/00-root.md` instead of being redirected to `~/.roo/AGENTS.md`. Roo Code's `loadRuleFiles()` reads `.roo/rules/` from both the global `~/.roo` directory and the project directory; `loadAllAgentRulesFiles()` never reads a home-directory `AGENTS.md`. The old `~/.roo/AGENTS.md` path is kept as a lowest-priority import fallback for users migrating from the old (buggy) output.
  - **MCP (global): native → partial**. `~/mcp_settings.json` is still written, but Roo Code's `McpHub.getMcpSettingsFilePath()` actually resolves via `context.globalStorageUri.fsPath + '/settings/mcp_settings.json'` — a non-deterministic per-OS/per-fork path agentsmesh cannot target. A new global-scope lint warning explains this.
  - **Ignore (global): native → none**. `~/.rooignore` is no longer generated or imported. `RooIgnoreController` only ever reads `.rooignore` from the open workspace (`path.join(cwd, '.rooignore')`) — there is no home-directory/global ignore concept. A new global-scope lint warning explains the drop.
  - **Permissions (project): partial → native**. Canonical `allow`/`deny` command-prefix rules are now written to (and read back from) `.vscode/settings.json` under `roo-cline.allowedCommands` / `roo-cline.deniedCommands` — real, workspace-scoped VS Code settings Roo Code's `package.json` contributes without a `scope: application` restriction. The file is merged (read-modify-write), never overwritten. Scoped to command-prefix allow/deny only — canonical "ask" rules have no Roo Code equivalent and are lint-warned instead. Global scope stays `partial` (no deterministic VS Code user-settings path).
  - **Import-map (global root-rule) — fixed**: `src/core/reference/import-maps/roo-code.ts` now registers `.roo/rules/00-root.md` (`ROO_CODE_GLOBAL_ROOT_RULE`) as the primary `_root.md` alias in global scope, and adds a skip guard in the global rules-dir iteration so the root file is not double-mapped to `.agentsmesh/rules/00-root.md`. The legacy `.roo/AGENTS.md` path is kept as a secondary fallback alias for users migrating from the old (buggy) output. Previously, cross-reference rewriting for the global root rule was broken: links pointing to the root resolved to `.agentsmesh/rules/00-root.md` instead of `.agentsmesh/rules/_root.md`.

- e61f789: Rovo Dev: raise Commands and Agents to native/embedded, add Ignore partial, fix MCP path, fix permissions schema.
  - **Commands (project + global, none → native)**: `.rovodev/prompts.yml` (repo root) and `~/.rovodev/prompts.yml` (global user prompts) are real, documented saved-prompts manifests — https://support.atlassian.com/rovo/docs/save-and-reuse-a-prompt-in-rovo-dev-cli/ documents both the repo-root/cwd tier and the `~/.rovodev/prompts.yml` "global user prompts" tier. Canonical commands now generate a `prompts.yml` manifest entry (`name`/`description`/`content_file`) plus a `.rovodev/commands/<name>.md` content file, and both are read back on import. Commands are no longer projected as skills (`am-command-*` skill dirs) for this target.
  - **Agents (project + global, none → embedded)**: Rovo Dev has no native agent file format; agents are projected as skill bundles under `.rovodev/skills/am-agent-<name>/SKILL.md` (project) and `~/.rovodev/skills/am-agent-<name>/SKILL.md` (global) via `supportsConversion: { agents: true }`. The old `supportsConversion: { commands: true, agents: true }` for commands is removed since commands are now native (no longer need conversion).
  - **Ignore (project + global, none → partial)**: Rovo Dev has no dedicated project-level ignore file surface. `lintIgnore` warns when canonical ignore patterns are present but cannot be projected.
  - **MCP (project): native → partial**. No project-level MCP config file is documented for Rovo Dev — only `~/.rovodev/mcp_config.json` (global) exists. `.rovodev/mcp.json` is no longer generated or imported at project scope; a `lintMcp` warning explains the drop to users. (Final level is `partial`, not `none` — the lint stub satisfies the schema contract.)
  - **MCP (global): native — fixed path**. The generated/imported file is renamed from `~/.rovodev/mcp.json` to `~/.rovodev/mcp_config.json`, the actual documented filename (configurable via `mcp.mcpConfigPath` in `~/.rovodev/config.yml`).
  - **Permissions (global): native — fixed schema**. `~/.rovodev/config.yml`'s `toolPermissions` now emits the real nested shape (`toolPermissions.tools.<name>: allow|ask|deny`, with bash rules under `toolPermissions.tools.bash.default` / `toolPermissions.tools.bash.commands[]`) instead of a flat `{allow:[],deny:[],ask:[]}` list the CLI never reads.

  Source: https://support.atlassian.com/rovo/docs/manage-rovo-dev-cli-settings/, https://support.atlassian.com/rovo/docs/save-and-reuse-a-prompt-in-rovo-dev-cli/

- f5df6c1: Trae: fix agents round-trip, raise hooks to native, add full test coverage.
  - **Agents (project + global, native — fixed)**: `.trae/agents/<name>.md` files are now imported back via the descriptor importer (`preset: 'agent'`). The `importer` block previously had no `agents` key, so `agentsmesh import` silently dropped every agent file written by `agentsmesh generate`, breaking every generate→edit→import round-trip. Project agents import from `.trae/agents/`, global agents from `.trae-cn/agents/` (Trae CN edition). A canonical `TRAE_CANONICAL_AGENTS_DIR` constant and `importer-spec.ts` module were added.
  - **Hooks (project + global, partial → native)**: Trae's official documentation (docs.trae.cn/ide_hook-configuration-reference) confirms a fully writable file-based hook system. Project hooks live at `$PROJECT/.trae/hooks.json`; global hooks at `~/.trae-cn/hooks.json` (macOS/Linux). Both use a flat JSON schema: `{ "version": 1, "hooks": { "<Event>": [{ "matcher", "type", "command", "timeout"? }] } }`. `generateHooks` now serialises canonical command-type hooks to this format; `importHooks` in `importer.ts` reads them back into `hooks.yaml`. Prompt/agent hook types are dropped on both sides for a symmetric round-trip. The previous partial-level `lintHooks` warning is removed.
  - **Test coverage added**: `generateAgents` unit tests (path, frontmatter fields, tools conditional, model conditional, empty-array short-circuit, body trim); `generateHooks` unit tests (null, empty, single event, multi-event, timeout omit, prompt-drop); `rewriteGeneratedPath` tests for agents (`.trae/agents/` → `.trae-cn/agents/`) and hooks (`.trae/hooks.json` → `.trae-cn/hooks.json`); project and global agentPath tests in `descriptor-paths.test.ts`; agents + hooks import round-trip tests in `importer.test.ts` for both project and global scope.
  - **File size**: `index.ts` (was 205 lines) refactored to delegate the importer spec to `importer-spec.ts`, bringing it to 181 lines (within the 200-line rule).

- c09be1c: Warp: correct project MCP path to `.warp/.mcp.json` (Warp's own native surface) and raise five additional capabilities.

  **Path correction (project MCP):** `agentsmesh generate` now writes MCP servers to `.warp/.mcp.json` at the project root — Warp's own native project-scope config — instead of `.mcp.json`. The root `.mcp.json` is a cross-tool compatibility path Warp reads via autodiscovery (not its own primary surface). `agentsmesh import --from warp` reads `.warp/.mcp.json` accordingly.

  **Capability raises (both scopes unless noted):**
  - `commands`: none → embedded — commands are projected as Warp skill bundles under `.warp/skills/`.
  - `hooks`: none → partial — Warp has no file-based lifecycle hooks; a lint warning is emitted when hooks are configured (no file is generated).
  - `ignore`: none → partial — Warp has no ignore-file surface; a lint warning is emitted when ignore patterns are configured.

  **Global scope only:**
  - `mcp`: none → native — `agentsmesh generate --global` writes MCP servers to `~/.warp/.mcp.json` (standard `mcpServers` JSON), and `agentsmesh import --global` reads it back to canonical.

- 5be661a: fix(windsurf): raise additionalRules global partial→embedded, add permissions partial, add unit tests

  ## Changes

  **globalCapabilities.additionalRules: partial → embedded (global scope)**

  Windsurf's global additional rules are embedded into the single aggregate file
  `~/.codeium/windsurf/memories/global_rules.md` (confirmed by official Devin Desktop
  documentation at https://docs.devin.ai/desktop/cascade/memories). Per-rule files do
  not exist at global scope. `renderWindsurfGlobalInstructions` is now wired as
  `globalLayout.renderPrimaryRootInstruction` and appends non-root rules via
  `appendEmbeddedRulesBlock`. Branch coverage tests added to
  `tests/unit/targets/windsurf/rules-branches.test.ts`.

  **permissions: none → partial (project and global scopes)**

  `windsurf.cascadeCommandsAllowList` and `windsurf.cascadeCommandsDenyList` are real
  VS Code extension settings (documented at https://docs.windsurf.com/windsurf/terminal).
  The settings surface is real but does not meet the native threshold: no official
  documentation specifies a writable file path or workspace-scope support for these keys —
  all docs reference "Command Palette → Open Settings (UI)". Partial is the accurate level
  for both scopes. `lintPermissions` is added to both the project and global descriptor
  lint hooks to emit a warning when canonical permissions are present. Branch coverage tests
  added to `tests/unit/targets/per-target-lint-branches-2.test.ts`.

  **Deferred: .devin/rules/ path (Devin Desktop rebrand)**

  Windsurf rebranded to Devin Desktop on June 2 2026. The new preferred workspace rules
  directory is `.devin/rules/` (`.windsurf/rules/` is kept as legacy fallback per official
  docs). The importer, generator, import-maps, and detection paths have not been updated to
  support `.devin/rules/`. This is a deferred follow-up tracked separately; the `native`
  level for `additionalRules` at project scope remains accurate because `.windsurf/rules/`
  is still read by Devin Desktop.

- 4cca64a: fix(zed): revert hooks to none, wire global skills round-trip

  ## Changes

  **hooks: partial → none (project and global)**

  Zed lifecycle hooks (agent.hooks) are a 2026 GitHub proposal (#57890,
  #57943) that has never shipped. No writable hooks surface exists in any
  stable or preview release. Reverted both project and global hooks capability
  from 'partial' to 'none'. The lintHooks descriptor entry is removed; the
  generic silent-drop-guard now issues the warning when canonical hooks are
  present. The lintHooks message itself ("Zed has no lifecycle hook system")
  confirmed the over-claim.

  **globalCapabilities.skills: wired generator and importer (native, confirmed)**

  Zed v1.4.0+ officially reads global skills from ~/.agents/skills/ (confirmed
  at https://github.com/zed-industries/zed/blob/main/docs/src/ai/skills.md).
  The native claim was correct per primary docs but the round-trip was broken:
  - Added `ZED_GLOBAL_SKILLS_DIR = '.agents/skills'` constant (home-relative,
    same suffix as project because Zed uses the same dir name at both scopes).
  - Added `skillDir: ZED_GLOBAL_SKILLS_DIR` to globalLayout so the reference
    rewriter maps skill references correctly in global scope.
  - Added `.agents/skills` to `globalLayout.managedOutputs.dirs`.
  - Removed the `scope === 'project'` guard in importFromZed so global import
    reads skills from .agents/skills/ (relative to the home-dir projectRoot).

  The generator already emits to `.agents/skills/*` which, in global mode
  (projectRoot = home dir), correctly resolves to ~/.agents/skills/\*.

### Patch Changes

- 059b177: Capability ledger: add a `text` format for plain-text surfaces (shell hook scripts, Starlark permission rules, gitignore-style files) so conformance checks them by path/extension instead of mislabeling them as markdown.
- 0ea9e4f: Crush: fix global-scope settings merge — `mergeGeneratedOutputContent` now also matches the global `~/.config/crush/crush.json` path, so mcp, hooks, and permissions merge into one file instead of overwriting each other in global mode.
- e205914: Fix capability-ledger engine: preserve researched maxAchievable ceilings and full fingerprints during merge, report over-declared cells independently from unverified.
  - `scripts/merge-capability-ledger.ts`: fix two data-loss bugs — (1) confirmed/rejected cells now keep their researched `maxAchievable` ceiling instead of being overwritten by the descriptor level; (2) fingerprint preservation now checks all three arrays (topLevelKeys, requiredFrontmatter, keyChecks), not just topLevelKeys, so manually-added keyChecks and requiredFrontmatter entries are no longer silently wiped.
  - `src/core/capabilities/merge.ts`: extract merge logic into a pure, unit-tested module (`mergeCell`, `hasNonEmptyFingerprint`). `pnpm capabilities:merge` is now a registered script.
  - `src/core/capabilities/audit.ts`: report `over-declared` independently from `unverified` — a cell with `verifiedAt=null` and a descriptor that exceeds its `maxAchievable` now appears in the stale bucket with both reasons rather than masking the over-declared signal.

- 2f27b64: schema-test: add no-op generator stubs to satisfy descriptor schema contract across 9 targets; remove pending-validation skip from the builtin-descriptor schema test so all builtins are validated on every run.

  The descriptor schema validator requires a `generateX` function (or `emitScopedSettings` / `globalSupport.scopeExtras`) for every capability whose level is not `'none'`. Nine built-in targets declared partial/native capabilities without a matching generator, causing the schema test to skip them. This change adds minimal no-op stubs (returning `[]`) to each affected target and removes the skip set so the test now validates all 30 built-in descriptors.

  **aider**: add `generateMcp`, `generateHooks`, `generatePermissions` no-op stubs. Aider has no MCP config file, no lifecycle hook system, and no permissions config. Existing lint functions (`lintMcp`, `lintHooks`, `lintPermissions`) surface advisory warnings.

  **deepagents-cli**: add `generateIgnore`, `generatePermissions` no-op stubs. Deep Agents CLI has no dedicated ignore file (relies on `.gitignore`) and permissions are env-var-based. Existing lint functions warn.

  **factory-droid**: add `generateIgnore` no-op stub. Factory Droid relies on `.gitignore` for ignore; the existing `lintIgnore` warns when canonical ignore patterns are present.

  **goose**: add `generatePermissions` no-op stub. Goose permissions are global-only (`~/.config/goose/permission.yaml`, emitted by `scopeExtras`); project-scope has no file surface. `lintPermissions` warns at project scope.

  **jules**: add `generateCommands`, `generateMcp`, `generateHooks`, `generateIgnore`, `generatePermissions` no-op stubs. Jules is a cloud-based async agent that only reads `AGENTS.md`; none of these surfaces exist. Existing lint functions warn.

  **kiro**: add `generatePermissions` no-op stub. Kiro permissions.yaml is not yet generated by agentsmesh. `lintPermissions` warns.

  **pi-agent**: add `generateHooks`, `generateIgnore`, `generatePermissions` no-op stubs. Pi Agent hooks are extension-based (not yet generated), has no dedicated ignore file, and no permissions config. Existing lint functions warn.

  **warp**: add `generateHooks`, `generateIgnore` no-op stubs. Warp has no lifecycle hook system and no dedicated ignore file. Existing lint functions warn.

  **windsurf**: add `generatePermissions` no-op stub in `generator/permissions.ts`. Windsurf terminal permissions are managed via the user settings UI. `lintPermissions` warns.

## 0.30.2

### Patch Changes

- f6e8096: Fix interactive prompts hanging behind the status spinner. `install`, `uninstall`, and `refresh` held the spinner across the whole run, and its redraw timer overwrote the interactive prompts underneath (skill-pack select, broken-link, invalid-resource confirm, uninstall drift, and the refresh consent prompt) — leaving the command waiting on invisible input (refresh silently timed out after 5 minutes and skipped the pack). The spinner now yields the terminal to the prompt flow whenever a run may prompt (real TTY, no `--force`/`--dry-run`), mirroring `init`.

  Also hardened the prompt primitives: `confirm()` now reuses the shared `readLine` helper so a closed or erroring stdin declines gracefully instead of hanging (Ctrl-D) or crashing; `readLine` resolves to empty (decline) on a stream `error` instead of throwing. And `install --force --dry-run` now previews the same resource set a real `--force` install would write (invalid resources were incorrectly dropped from the preview).

## 0.30.1

### Patch Changes

- d4e496a: Reject MCP read, write, and delete paths that escape the project directory through symlinks. Containment is anchored at the project root (not `.agentsmesh`), so a symlinked config file **or** a symlinked `.agentsmesh` parent directory can no longer leak or overwrite files outside the project. Covers skill and canonical (rules/commands/agents) list/get/create/update/delete, plus all config reads and writes (`get_config`/`update_config`, permissions, hooks, ignore, and MCP-server tools). Note: config reads that escape through a symlink now raise `PATH_TRAVERSAL` instead of returning `null`.

## 0.30.0

### Minor Changes

- 7b795b8: Lessons: measure effectiveness and sharpen recall

  The lessons subsystem now tracks whether a recalled rule actually prevented the repeat, and improves recall precision — all opt-in and backward-compatible (no change to the CLI, MCP, or `lessons.json` surface):
  - **Effectiveness signal (opt-in via `AGENTSMESH_LESSONS_TELEMETRY=1`).** An append-only outcome log records deliveries and failures; effectiveness is derived at read time — did a delivered lesson prevent the repeat? Recall **down-ranks** a lesson that fired but never helped, `lessons validate` gains advisory `INEFFECTIVE_LESSON` and `UNCOVERED_FAILURE` findings, and `lessons stats` gains a coarse **effectiveness block** (deliveries, held rate, ineffective count). The signal is deliberately coarse and labeled as such — never presented as proof of prevention.
  - **Diff-aware recall.** The recall hook binds on the content being written, not just the file path, so a keyword lesson can fire on the change itself.
  - **camelCase keyword reach.** Keyword recall now also splits camelCase/acronym identifier sub-words while retaining the whole token (fully backward compatible), so a keyword like `guard` reaches `useLeaveGuard.ts`.
  - **Quieter injection.** Automatic recall caps the injected set to the most relevant few and stays silent on no match.
  - **Recurrence-driven capture nudge.** A failure recurring on the same action with no covering lesson escalates the capture reminder, pre-filled from the real file/command.
  - **Portable failure detection.** The recall hook records a failure from any tool event carrying an error payload, not only Claude Code's dedicated `PostToolUseFailure` event — so effectiveness can accumulate on more harnesses.
  - **New capture warning `WIDE_GLOB_MATCH`** flags a `file_glob` that matches a large share of the working tree, complementing the existing structural broad-glob check.
  - **`agentsmesh init --lessons`** now commits the `.gitattributes` binding for the `lessons.json` union merge driver and prints the per-clone `git config` setup, so a team's concurrent captures merge cleanly instead of conflicting.

- 7b795b8: Lessons: `--scope always` for universal always-on rules

  A lesson can now be captured with `--scope always` (MCP: `scope: "always"`) for a universal standard that applies to every task — a comment/test/style convention that no single file or command names. Always-on lessons need no trigger and are delivered on every task automatically, alongside triggered recall, deduplicated once per session.

### Patch Changes

- 13730ca: Lint no longer warns about agentsmesh-injected best-effort hook events

  `agentsmesh lint` previously flagged the recall/capture hook events agentsmesh itself injects (`UserPromptSubmit`, `PostToolUseFailure`, `SessionStart`) as "unsupported" on targets whose hook model can't represent them — an unactionable warning, since agentsmesh injects those events and degrades them gracefully. They are now excluded from the unsupported-hook warning across every whitelist-style target.

## 0.29.0

### Minor Changes

- 663f0e6: Strip elevated artifacts from remote `extends` sources by default

  `hooks`, `permissions`, and `mcp` contributed by a **remote** `extends` source (`github:`, `gitlab:`, `git+…`, including `git+file://`) are now stripped during config load unless the entry opts in with `accept: [hooks, permissions, mcp]`. This closes a gap where a remote `extends` could inject shell-executing config (settings hooks, MCP launch specs) without the per-artifact consent that `agentsmesh install` already requires. Local `extends` remain trusted as-is, and a warning reports anything that was stripped.

### Patch Changes

- 11f90bc: Harden plugin source containment against intermediate-symlink escapes

  The plugin loader now canonicalizes an unresolvable source path against its nearest existing ancestor instead of falling back to the raw path. This closes a gap where a local plugin `source` routed through a symlinked directory that resolves outside the project root could slip past the trust-boundary check when its entry file did not exist yet. Legitimate in-project plugins are unaffected.

- c647c9b: Docs: the README now leads with lessons (the shared agent memory), adds a head-to-head comparison with Ruler and rulesync, embeds demo GIFs, leads the quickstart with the import-first path for existing repos, and documents the new `extends` `accept:` consent. Documentation-only — no behavior change.

## 0.28.0

### Minor Changes

- e148490: Deterministic pre-edit lesson recall via a `PreToolUse` hook.

  `agentsmesh init --lessons` now wires the recall hook under **both** `PreToolUse` and `PostToolUse`, and `agentsmesh lessons hook` is event-aware (it echoes the harness `hook_event_name`). On targets whose hooks can inject context before a tool call (e.g. Claude Code), matching lessons are now surfaced **before the first edit/command** — guarding the "first touch" the previous PostToolUse-only design left unguarded — with no extra model turn and no compliance dependence. Session dedup keeps each lesson injected at most once per session, and `PostToolUse` remains as the fallback for harnesses that support only post-call context injection. Existing projects pick this up by re-running `agentsmesh init --lessons` (idempotent) and `agentsmesh generate`; behavior is unchanged when no `hook_event_name` is supplied (defaults to `PostToolUse`).

## 0.27.0

### Minor Changes

- c172153: Declare Amazon Q `additionalRules` as **Native** for project scope. AgentsMesh already emits each non-root rule as a separate `.amazonq/rules/<slug>.md` file (which Amazon Q auto-loads) and imports them back, so the capability was under-declared as `none`. Global scope stays `none` because Amazon Q has no global rules directory on disk (`~/.aws/amazonq/` is used only for MCP and agents).
- 9492875: Declare Augment Code `permissions` as **Native** for global scope (was `none`). Auggie (Augment's CLI) reads tool permissions from the personal `~/.augment/settings.json` `toolPermissions` array (`[{ toolName, permission: { type: allow | deny | ask-user } }]`), mapped to canonical allow / deny / ask. Generation now emits `toolPermissions` into the global settings.json (alongside `mcpServers`/`hooks`) and import reads it back. Project scope stays `none` — per Augment's docs, tool permissions are personal/global and apply only in the CLI, not the IDE extension. (Advanced `webhook-policy` / `script-policy` / `shellInputRegex` entries have no canonical equivalent and are skipped on import.)
- c172153: Codex CLI hooks are now declared **Native** (project and global), correcting a `partial` mislabel. Codex CLI reads lifecycle hooks from a real on-disk file — `.codex/hooks.json` (project) and `~/.codex/hooks.json` (global) — which AgentsMesh already generates from `.agentsmesh/hooks.yaml` and imports back, so the round-trip was fully working and only the declared capability level was wrong. The support matrix (README + website) now shows Codex CLI hooks as Native.
- 4d31ea5: Declare Continue `permissions` as **Native** for global scope (was `none`). Continue reads personal tool permissions from `~/.continue/permissions.yaml` (top-level `allow` / `ask` / `exclude` arrays of tool-matcher patterns); AgentsMesh now generates that file in global mode and imports it back, mapping `exclude` ↔ canonical `deny`. Project scope stays `none` — Continue's own spec marks project-level permissions "not implemented yet".

  Also: the descriptor schema now accepts a target's `globalSupport.scopeExtras` as a valid implementation of a settings-backed capability (mcp/hooks/ignore/permissions) at global scope, since `scopeExtras` is the global-only emit path Continue uses.

- eddf184: Declare GitHub Copilot `hooks` as **Native** for project scope (was `partial`). Copilot CLI auto-loads `.github/hooks/*.json` at startup, and AgentsMesh already generates `.github/hooks/agentsmesh.json` (plus wrapper scripts) and imports it back — the round-trip was fully working and only the declared level was wrong. Lint still warns about unsupported hook events and the POSIX-shell wrapper-script requirement. (Global Copilot hooks at `~/.copilot/hooks/*.json` remain a separate follow-up.)
- b591409: Declare Cursor `additionalRules` as **Native** (both scopes; was `embedded`). AgentsMesh already emits each non-root rule as a separate native `.cursor/rules/<slug>.mdc` file and imports them back — identical to Cline — so the level was under-declared. No generator/importer changes; the round-trip already worked.
- dcbe440: Declare Factory Droid `commands` as **Native** (both scopes; was `none`). Factory Droid reads custom slash commands from `.factory/commands/*.md` (project) and `~/.factory/commands/*.md` (global) — Markdown with optional `description` / `allowed-tools` frontmatter, filename as the command slug (per docs.factory.ai). AgentsMesh now generates and imports these native command files instead of projecting commands into `.factory/skills/am-command-*/SKILL.md`; `supportsConversion.commands` is removed. Regenerating replaces the old projected command-skills with native `.factory/commands/` files.
- b591409: Declare Gemini CLI `permissions` as **Native** for global scope (was `none`). Gemini's policy engine loads User-tier `~/.gemini/policies/*.toml`, and AgentsMesh's permissions generator/importer already produce and read that TOML — the global layout was simply suppressing it. Policies now emit in global mode and round-trip. Project scope stays `partial` (workspace-tier policies are disabled upstream).
- fd7e4a5: Declare Goose `hooks` as **Native** for both scopes (was `none`). Goose supports lifecycle hooks via the Open Plugin Specification — a `hooks/hooks.json` inside a plugin dir, auto-discovered at `.agents/plugins/agentsmesh/hooks/hooks.json` (project) and `~/.agents/plugins/agentsmesh/hooks/hooks.json` (global). The file uses the same wrapped command-hook shape as Codex CLI / Factory Droid (`{ "hooks": { "<Event>": [{ matcher?, hooks: [{ type, command }] }] } }`), so AgentsMesh now generates and imports it through the shared `wrapped-command-hooks` helper. The previous no-op `lintHooks` warning is removed.
- c94d3cd: Declare Goose `permissions` as **Native** for global scope (was `none`). Goose reads tool permissions from `~/.config/goose/permission.yaml` — a map keyed by category where AgentsMesh owns the `user` block (`always_allow` / `ask_before` / `never_allow`, mapped to canonical allow / ask / deny). Generation emits it via `scopeExtras` and **merge-preserves** every other category (notably Goose's runtime `smart_approve` cache); import reads the `user` block back. Project scope stays `none` (Goose has no project-level permission file), and the project-scope lint warning now points users at the global file instead of claiming permissions are unsupported.
- d34681a: Declare Pi Agent `commands` as **Native** (both scopes; was `none`). Pi discovers prompt templates from `.pi/prompts/*.md` (project) and `~/.pi/agent/prompts/*.md` (global) — Markdown with optional `description` frontmatter, filename as the command name, `$ARGUMENTS` substitution (per earendil-works/pi). AgentsMesh now generates and imports these native prompt templates instead of projecting commands into `.pi/skills/am-command-*/SKILL.md`; `supportsConversion.commands` is removed (agents are still projected as skills). Also corrects `metadata.officialUrl` to `https://github.com/earendil-works/pi` (was the non-existent `pi-labs/pi-agent`). Canonical `allowedTools` have no Pi equivalent and are dropped on generate.
- 0063ecc: Declare Roo Code `agents` as **Native** for project scope (was `partial`) by adding the missing importer. AgentsMesh already generated `.roomodes` (canonical agents → Roo `customModes`); it now imports `.roomodes` back into `.agentsmesh/agents/<slug>.md`, completing the round-trip (`slug` → filename, `name`/`description` → frontmatter, `roleDefinition` → body). Global agents stay `partial` because Roo's global custom modes live in VS Code globalStorage, not an AgentsMesh-ownable file.

### Patch Changes

- ed90714: Make Aider actually load the generated `CONVENTIONS.md`. Aider has no auto-discovery for `CONVENTIONS.md` — it must be referenced from `.aider.conf.yml` via the `read:` key — so the rules AgentsMesh emitted were silently ignored. Generation now also emits a project-level `.aider.conf.yml` with `read: [CONVENTIONS.md]`, merge-preserving any existing user config (other keys kept, `read` list unioned). Scoped to project mode (a home-level config's `read:` path semantics differ and are out of scope); the `.aider.conf.yml` is deterministic wiring and is not imported as canonical content.
- c172153: Fix Amazon Q agent generation/import using the wrong system-prompt key. AgentsMesh wrote and read `systemPrompt`, but Amazon Q's `agent-v1.json` schema uses `prompt` — so generated `.amazonq/cli-agents/*.json` agents silently lost their system prompt. Generation now emits `prompt`; import reads `prompt` and falls back to the legacy `systemPrompt` key so previously generated agent files still round-trip.
- c172153: Fix Augment Code rule frontmatter to use the official `type` key. AgentsMesh emitted boolean flags (`always_apply: true`, `agent_requested: true`), but Augment Code rules declare their activation via a single `type` field (`type: always_apply` / `type: agent_requested`). Generation now emits `type: …`; import reads `type` and still accepts the legacy boolean keys for backward compatibility.
- b591409: Fix `agentsmesh import --from crush --global` silently importing no MCP servers (and no hooks). The Crush config reader was scope-blind and always read `<root>/crush.json`; in global scope it now reads `~/.config/crush/crush.json` (Crush's real global config), so global MCP/hooks round-trip as the `native` matrix already claims.
- c172153: Fix Cursor hooks being emitted in a format Cursor cannot read. AgentsMesh wrote `.cursor/hooks.json` with Claude-style PascalCase event names (`PreToolUse`) and a nested `{ matcher, hooks: [...] }` structure, but Cursor uses camelCase event names (`preToolUse`, `postToolUse`, `beforeSubmitPrompt`, …) and a flat array of hook objects — so generated hooks silently never fired. Generation and import now use Cursor's real event names and flat shape, the canonical↔Cursor mapping round-trips, and a lint warning is emitted for canonical hook events Cursor has no equivalent for.
- b2ccc64: Fix `agentsmesh import --from factory-droid` silently dropping native droid agents. Factory Droid's `agents` capability was declared **Native** and generation already emitted `.factory/droids/<name>.md`, but the importer had no `agents` spec — so the round-trip the matrix promised never happened (import produced no `.agentsmesh/agents/*`). The descriptor now imports `.factory/droids/` (and the global `~/.factory/droids/`) back into canonical agents via the `agent` preset, completing the round-trip in both scopes.
- efd0c6f: Fix Factory Droid `hooks.json` format and complete its round-trip. Factory's `hooks.json` nests events under a top-level `"hooks"` key (`{ "hooks": { "PreToolUse": [{ matcher, hooks: [{ type, command }] }] } }`, per docs.factory.ai) — but generation emitted the bare top-level Claude Code shape Factory does not read, and there was no importer at all, so the declared **Native** hooks never round-tripped. Generation now wraps under `hooks` and `agentsmesh import --from factory-droid` reads it back into `.agentsmesh/hooks.yaml` (both scopes). The wrapped command-hook serialize/import logic — identical to Codex CLI's — is now a shared `wrapped-command-hooks` helper that both targets use, removing the duplication.

## 0.26.0

### Minor Changes

- 32c21ef: Prettier CLI on a real terminal via `@clack/prompts`: `generate`, `install`, `uninstall`, `refresh`, `import`, and `convert` now show spinners, styled status lines, and boxed summaries. Output stays plain and parseable when piped, in CI, or with `--json`/`NO_COLOR` — no escape bytes leak into scripted or machine-read output.

  `agentsmesh matrix` now renders a vertical (transposed) table — targets as rows, features as compact symbol columns with a legend and abbreviation key — so it fits a normal terminal instead of overflowing horizontally across ~30 columns.

- 51cb54f: Add an interactive `init` wizard. On an interactive TTY, `agentsmesh init` now asks which targets to generate for (none pre-selected — you pick at least one), whether to import any detected tool configs, optionally whether to enable Lessons, and whether to run `generate` immediately — writing a tailored `agentsmesh.yaml`. Every step after the first offers a **↩ Back** choice to revisit and change an earlier answer.

  The wizard runs in both project and `--global` scope. In `--global` it restricts the target list to global-capable tools and skips the Lessons step entirely (lessons is project-only, enforced at the writer).

  Fully backward compatible: the wizard is skipped and the original non-interactive behavior runs whenever `--yes`, `--json`, or a non-TTY/CI environment is detected. Scripted and CI usage is unchanged. Cancelling (Ctrl-C) at any prompt writes nothing.

### Patch Changes

- 28d8138: Fixed: the MCP server's `generate` tool now persists `.agentsmesh/.lock`. It previously reimplemented file-writing and skipped the lockfile (while still reporting `lockfileUpdated: true`), which left `agentsmesh check` permanently drifted in CI for projects that generate through the MCP server. The handler now delegates to the same path as `agentsmesh generate`, so it writes target files, cleans stale outputs, and updates the lock identically.
- c6cdeab: Rewrote `README.md` for a faster first read: a 60-second quickstart, a clearer before/after, and a tightened feature overview that now documents the interactive `init` wizard and automatic link rebasing — while still covering every feature and preserving the generated support-matrix tables. Added a "Minimal config" example to the `agentsmesh.yaml` reference page so new projects see the start-here config before the full reference.

## 0.25.0

### Minor Changes

- d2d175b: Security hardening and silent-data-loss fixes across the install, import, and generate pipelines, plus a tightened lessons skill.

  **Security**
  - The `install` / `extends` git fetch now enforces a transport allowlist (`https`/`ssh` only) on **both** the ref-resolution (`git ls-remote`) and the actual clone, before any git process is spawned — closing an SSRF / local-repo-probe primitive and a clone-time redirect-to-`ext::`/`file://` (RCE/local-read) vector. `git+http://`, `git+file://`, and `git+git://` sources are refused by default; opt in with `AGENTSMESH_ALLOW_INSECURE_GIT=1` (http) or `AGENTSMESH_ALLOW_LOCAL_GIT=1` (file). Clones now also run with `core.symlinks=false`.
  - The canonical parsers (`rules`/`commands`/`agents`/`skills`) and **every** native-import directory reader no longer follow symlinks. This prevents a malicious pack or an imported tool config from exfiltrating host files (e.g. `~/.ssh/id_rsa`) into canonical content or a redistributed pack.

  **Fixed**
  - `agentsmesh import --from cline` and `--from continue` now preserve URL/HTTP/SSE MCP servers instead of dropping every remote server on a generate → re-import round-trip.
  - The shared Markdown link scanner no longer corrupts content when a link label contains `(` or a link carries a `"title"` — the rewrite span now covers only the path.
  - The MCP `update_hooks` tool normalizes the nested native hook form to the flat canonical shape instead of silently discarding it.
  - A single unparseable lessons trigger (from a merge or hand-edit) no longer permanently blocks all future `lessons add`/`merge` captures — the write barrier now blocks only on errors the current mutation introduces.
  - `parseRules` now errors on duplicate-slug rule files that previously vanished silently.

  **Changed (breaking)**
  - Git transports other than `https`/`ssh` are refused by default on `install`/`extends`; re-enable `http`/`file` with the env vars above.
  - `agentsmesh import --from <tool>` no longer follows symlinks in a tool's config directories — symlinked rule/command/agent/skill files and directories are skipped. Share content via real files, `extends:`, or packs instead.
  - Case-only canonical name collisions (e.g. `commands/Build.md` + `commands/build.md`) are now a hard error at parse and generate time instead of a silent last-write-wins on case-insensitive filesystems.

  **Docs**
  - `agentsmesh.local.yaml` docs now describe the real replace/append/merge behavior (the previous "narrowing-only" guarantee was never enforced).
  - The `lessons` skill is now an Iron-Law gate (binding recall/capture, gate function, rationalization table) with a short trigger-first description; fetch-hardening and git-transport env vars are documented.

## 0.24.0

### Minor Changes

- 352f4a0: feat: close 23 target capability gaps and make new MCP capabilities round-trip

  Audited every supported target and implemented native or partial support for
  capabilities the underlying tools already offer but agentsmesh did not expose:
  - **MCP**: Goose (global, `~/.config/goose/config.yaml` extensions) and Copilot
    (project, `.vscode/mcp.json`) now both generate **and import** MCP servers, so
    the new native MCP capabilities round-trip back to canonical.
  - **Agents**: Augment Code, Amazon Q, and Cline gain native agent definitions.
  - **Skills / Commands**: Zed emits shared native skills; Trae gains native
    commands (`.trae/commands/`).
  - **Permissions**: Junie (global allowlist) and Kilo Code (`kilo.jsonc`) gain
    native permissions; Warp, Roo Code, and Antigravity declare `partial` support
    with lint guidance pointing at their UI / settings.
  - **Hooks**: Factory Droid, Deep Agents CLI, Antigravity, Qwen Code, Amp, and
    Codex CLI gain native lifecycle hooks.
  - **Combined settings sidecars**: Qwen Code and Amp write hooks + permissions
    into their settings files; Rovo Dev writes hooks + permissions to its global
    `config.yml`; Amazon Q gains agents + hooks + permissions.

  The shared `mcpJson` import mode gains an optional, data-driven `mcpServersKey`
  (defaults to `mcpServers`) so VS Code-style files keyed on `servers` import
  correctly — with no target-name hardcoding in core. The support matrix in the
  README and docs site is updated to match.

## 0.23.0

### Minor Changes

- 6a2e415: feat(lessons)!: JSON graph store, universal CLI primitives, clean break from YAML+MD

  **BREAKING.** The lessons subsystem is now a single normalized JSON graph at
  `.agentsmesh/lessons/lessons.json`. The previous YAML-index + per-topic
  Markdown + journal store is removed entirely. The legacy public API is
  removed.

  **Why a clean break:** dragging a deprecation window along would leave two
  parallel surfaces (CLI + library) that have to stay in sync forever, and the
  old recall ritual (read 400+ line YAML index + matching topic Markdown files)
  encouraged agents to skip it. The new single-command primitives — `lessons
query` to recall, `lessons add` to capture — are hard to rationalize past and
  return only matched rules (~100–500 tokens) instead of the whole index.

  ## What's new

  **CLI** (`agentsmesh lessons …`):
  - `query --file <p> --cmd <c> [--keyword <k>] [--format plain|md|json]` —
    recall primitive. Returns only matched lesson rules; defaults to one rule
    per line.
  - `add "<rule>" --topic <id> --trigger-file <glob> [--trigger-cmd <regex>]
[--trigger-kw <text>] [--evidence <ref>] [--new-topic --topic-summary
"<text>"]` — capture primitive. Lock-serialized, atomic, idempotent on
    repeat.
  - `topics`, `show <topic>`, `deprecate <id> [--superseded-by <id>]`,
    `journal`, `validate`, `import-md`.

  **MCP tools.** `lessons_query` and `lessons_add` register with the embedded
  MCP server. Same surface as the CLI primitives.

  **Programmatic API** (`agentsmesh/lessons`):
  - `loadLessonsGraph` / `tryLoadLessonsGraph` / `saveLessonsGraph` /
    `serializeGraph` / `graphFilePath` — deterministic load/save.
  - `queryLessons(graph, { file, command, keyword })` — recall.
  - `addLesson(root, input, opts?)` — capture; throws `UnknownTopicError` when
    the topic is missing without `allowNewTopic`.
  - `validateLessonsGraph(graph)` →
    `{ ok, findings: [{ level, code, message, … }] }`. Codes: `SCHEMA_INVALID`,
    `DANGLING_TOPIC`, `DANGLING_TRIGGER`, `DANGLING_SUPERSEDER`,
    `DUPLICATE_RULE`, `SUPERSEDED_WITHOUT_TARGET`, `ACTIVE_WITH_SUPERSEDER`,
    `ORPHAN_TOPIC`, `ORPHAN_TRIGGER`.
  - `importLegacyLessons(root, { migratedAt })` — one-shot upgrade migrator.
  - `acquireLessonsLock(root)` — process lock; same primitive as
    `.generate.lock` / `.install.lock`.

  ## Upgrade path

  If you used the previous YAML+MD store, the first `agentsmesh lessons`
  invocation auto-migrates: parses `index.yaml` + `topics/*.md` + `journal.md`,
  writes `lessons.json`, and **deletes the legacy files** so the project lands
  in a clean state. The migrator preserves provenance — every imported lesson
  gets `evidence[0] = "legacy:.agentsmesh/lessons/topics/<topic>.md#rule-N"`
  plus any inlined `(Evidence L<n>)` references parsed verbatim as `legacy:L<n>`.

  Run `agentsmesh lessons import-md` explicitly if you prefer to migrate at a
  specific point in time, e.g. inside a release-prep script.

  ## Removed (breaking)
  - **Files removed.** `.agentsmesh/lessons/index.yaml`,
    `.agentsmesh/lessons/journal.md`, `.agentsmesh/lessons/topics/`, plus the
    separate distill tracker (`distill-ledger.yaml`, `distill-proposal.md`).
    All are recreated under the new single-file graph by the migrator.
  - **Public API removed.** `loadLessonsIndex`, `readTriggeredLessons`,
    `appendLessonToJournal`, `formatLessonBullet`, `parseIndex`,
    `LessonsIndexSchema`, `LessonsCluster`, `LessonsIndex`, `matchTriggers`,
    `ToolEvent`, `parseBullets`, `ParsedBullet`, `hashBullet`, `loadLedger`,
    `saveLedger`, `Ledger`, `scoreBullet`, `ScoredCluster`,
    `LESSONS_JOURNAL_TEMPLATE`, `LESSONS_INDEX_TEMPLATE`, `AppendLessonResult`,
    `LessonCaptureInput`, `TriggeredLesson`.
  - **package.json scripts removed.** `distill`, `distill:apply`. The distill
    flow is subsumed by direct `lessons add`.

  ## Compatibility
  - The CLI surface is **additive** for the `lessons` subcommand tree — no
    existing CLI command changes shape.
  - `agentsmesh init --lessons` still scaffolds the subsystem; it now writes
    an empty graph instead of empty YAML+MD shells.
  - The procedural rule in `_root.md` is regenerated by `agentsmesh generate`
    into every target's root file; agents call the same two shell commands in
    every harness.

  ## Constraints
  - The graph at `.agentsmesh/lessons/lessons.json` is the single source of
    truth — never edit it by hand; go through the CLI or `addLesson`.
  - Writers serialize through a process lock at
    `.agentsmesh/lessons/.lessons.lock` — concurrent captures cannot lose data.
  - Output is deterministic (alphabetical keys at every depth, trailing
    newline) so diffs stay clean.

- 60dbbd9: feat(lessons): public-readiness hardening — discoverable flags, safer capture/recall, clearer errors

  The lessons subsystem is polished for general use, closing the gaps a first-time
  external user would hit. No breaking changes to the documented happy path.

  **Added**
  - `agentsmesh lessons query` now documents `--session`, `--no-dedup`, and `--ids`
    in `--help` (they were parsed but invisible), and every `lessons` subcommand
    **rejects unknown flags** with the correct usage instead of silently ignoring
    them — a typoed `--trigger-flie` no longer drops a trigger from a capture.
  - Running a `lessons` command from a subdirectory of a project now **warns**
    (`query` finds no graph here; `add` flags that it is about to create a stray
    `.agentsmesh`) instead of silently returning empty or writing to the wrong place.
  - Running a `lessons` command in a project initialized **without** `--lessons` no
    longer dead-ends silently: reads hint to run `agentsmesh init --lessons`, and
    `lessons add` still captures but warns that recall isn't wired into your AI
    tools until you activate the subsystem.
  - A present-but-malformed `.agentsmesh/lessons/config.json` now surfaces a stderr
    warning rather than silently reverting to defaults.

  **Changed**
  - Capture rejects a rule longer than 2000 characters (`OVERSIZED_RULE`), and the
    recall hook truncates any over-long rule before injecting it into agent context,
    so a graph from a cloned third-party repo cannot flood the context with one
    giant rule. The lessons reference now documents this **trust model**.
  - `agentsmesh lessons hook` bounds the stdin payload it reads, so a runaway pipe
    cannot exhaust memory.
  - `lessons` errors now surface verbatim in `--json` output (e.g.
    `"Recall needs a predicate…"`) instead of a generic `Command 'lessons' failed`.
  - `agentsmesh init --lessons` only prints "the graph starts empty" when it
    actually created the graph on this run.

- 0091779: feat(lessons): two-tier delivery — trimmed always-on trigger + on-demand `lessons` skill

  The lessons recall/capture contract now ships in two tiers, using agentsmesh's
  native primitives (rules + skills) rather than a single oversized root paragraph:
  - **Tier 1 — always-on trigger.** `LESSONS_PROCEDURAL_RULE` is trimmed to the
    binding essentials (both commands, the BLOCKING framing, the recall scope
    including read-only, the broad capture scope, the graph path, the MCP
    fallback). It is still injected into `.agentsmesh/rules/_root.md` as a managed
    block, so it reaches every target through canonical rule generation.
  - **Tier 2 — on-demand manual.** `agentsmesh init --lessons` now also seeds
    `.agentsmesh/skills/lessons/SKILL.md`, a `lessons` skill carrying the full
    operating manual (complete command set, topic workflow, trigger-flag
    mechanics, the exhaustive rejected-excuse enumeration). It generates to every
    skill-capable target and can grow without bloating always-on context.
  - **Graceful degradation.** Targets without skills still receive the Tier-1
    trigger, so the binding contract stays universal.

  The skill is **create-if-missing** — once present it is your canonical,
  user-owned content and is never clobbered. Projects generated with the previous
  single-tier block upgrade to the trimmed block exactly once on the next
  `generate`/scaffold (legacy form retained for clean strip/upgrade).

### Patch Changes

- 3d59e52: fix: six correctness bugs surfaced by a full feature review
  - **lessons recall on symlinked roots**: `normalizeRecallFile` now realpaths the
    project root and an absolute `--file` before relativizing. The CLI derives the
    root from the physical `process.cwd()` while harnesses pass logical paths
    (macOS `/tmp` → `/private/tmp`), so on a symlinked checkout `relative()`
    escaped the root and recall — including the PostToolUse recall hook — silently
    matched zero lessons. Recall now resolves correctly.
  - **MCP lessons tools error codes**: failures (unknown topic, predicate-less
    query, unknown lesson id, capture-guardrail rejections) now return
    `NOT_FOUND` / `VALIDATION_FAILED` with the domain code in `details`, instead of
    mislabeling every failure as `IO_ERROR`.
  - **`generate` scoped-settings feature gating**: disabling a feature (e.g. `mcp`)
    no longer leaks it into the gemini / zed / amp / augment `settings.json`
    sidecars — `emitScopedSettings` is now gated by the enabled-feature set, for
    plugin descriptors as well as builtins.
  - **`matrix --global` accuracy**: targets without `globalSupport` (cloud-only
    Jules, Replit Agent) now report `none` in global scope instead of falsely
    claiming project-level support that `generate --global` never produces.
  - **`install --sync` consent**: elevated-artifact consent is now persisted
    (`accepted_elevated`) and replayed, so a sync no longer silently strips
    previously-consented hooks / permissions / mcp while `installs.yaml` and
    `pack.yaml` still claim them.
  - **`refresh` / `install --sync` branch pins**: a branch pin (`@main`) keeps
    tracking the branch across refreshes instead of freezing to a SHA after the
    first refresh and never advancing again.

- 6a5fc7e: fix(install): retry the git-source cache finalize on Windows transient locks

  Fetching a git `extends:`/`install` source could intermittently fail on Windows
  with `EPERM: operation not permitted, rename '<cache>.tmp' -> '<cache>'`. The
  fetcher finalizes the cache by renaming the freshly-cloned staging directory
  into place; on Windows the just-exited `git clone` handle (or an antivirus /
  search-indexer scan) can still pin those files for a few milliseconds, so the
  rename is rejected. The finalize rename now retries on the transient codes
  Windows raises (`EPERM`/`EACCES`/`EBUSY`/`ENOTEMPTY`/`EEXIST`) with a short
  backoff, so the lock clears instead of surfacing a spurious "fetch failed".
  POSIX behavior is unchanged (a single rename).

## 0.22.0

### Minor Changes

- c2a13ad: Add `agentsmesh init --lessons` and a new `agentsmesh/lessons` public API for
  the lessons recall + capture subsystem.

  The subsystem keeps agents from repeating past mistakes via a procedural rule
  that lives in every target's root file: before any edit or command, scan
  `.agentsmesh/lessons/index.yaml` and read every matched
  `.agentsmesh/lessons/topics/<topic>.md`; after any failure, append to
  `.agentsmesh/lessons/journal.md`. The optional repo-local `pnpm distill` /
  `pnpm distill:apply` scripts can help maintain AgentsMesh's own topic routing,
  but the generated rule does not require package-manager-specific tooling.

  **Using it:**
  - **Fresh init:** `agentsmesh init --lessons` — creates the canonical scaffold
    AND the lessons subsystem in one command.
  - **Retroactive add (existing project):** the same `agentsmesh init --lessons`
    — when `agentsmesh.yaml` already exists, init only scaffolds the lessons
    artifacts and appends the procedural rule to `_root.md`. Idempotent.
  - After either flow, run `agentsmesh generate` to project the procedural rule
    to every target's root file.

  **Public API** (importable from `agentsmesh/lessons`):
  - `scaffoldLessons(projectRoot)` — idempotent scaffolder used internally by
    `init --lessons`; reusable from custom tooling.
  - `loadLessonsIndex(projectRoot)`, `readTriggeredLessons(projectRoot, event)`,
    `appendLessonToJournal(projectRoot, input)`, and `formatLessonBullet(input)` —
    one high-level, target-agnostic read/write layer for integrations that should
    not hand-roll filesystem access.
  - `lessonsPaths(projectRoot)`, `LESSONS_PROCEDURAL_RULE`,
    `LESSONS_JOURNAL_TEMPLATE`, `LESSONS_INDEX_TEMPLATE` — paths and templates.
  - `parseIndex`, `LessonsIndexSchema`, `matchTriggers`, `scoreBullet`,
    `loadLedger`, `saveLedger`, `hashBullet`, `parseBullets` — building blocks
    for downstream tooling (custom distillers, recall hooks, IDE plugins).

  **Universal across every target.** The subsystem uses plain markdown files
  read via standard file I/O — no `Skill` tool, no description-match, no
  per-target projection. Works in Claude Code, Codex CLI, Cline, Roo Code,
  Cursor, Gemini CLI, Aider, Goose, and every other supported harness.

  **Linter integration:** `agentsmesh lint` now validates the lessons subsystem
  when present — checks that `index.yaml` parses, topic files referenced in the
  index exist, and the journal file is well-formed.

  **Constraints:**
  - `--lessons` is project-mode only. Combining with `--global` errors out.
  - Removal: `rm -rf .agentsmesh/lessons/` and strip the `## Lessons` paragraph
    from `.agentsmesh/rules/_root.md`.

### Patch Changes

- c75a424: Surface marketplace sub-pack install failures instead of swallowing them silently, and route skill-pack sub-packs through the correct install path.
- c75a424: Fix qwen-code global-mode rule embedding. Rules were silently dropped when generating in global mode; they are now embedded inline using the same pattern as other global-mode targets.
- c75a424: Restructure the generation contract paragraph to lead with an explicit **NEVER edit generated files** prohibition naming the generated paths (`.claude/`, `.cursor/`, `AGENTS.md`, etc.), followed by **All changes MUST go through `.agentsmesh` first**. Agents were initially understanding the contract but forgetting it over multi-step conversations — front-loading the prohibition makes it stickier. All legacy contract body versions (v1-v10) remain detected for safe in-place upgrade.

## 0.21.0

### Minor Changes

- b1efca1: Harden install pipeline against third-party supply-chain attacks.
  - **Strip elevated artifacts from non-local sources by default.** `hooks.yaml`, `permissions.yaml`, and `mcp.json` are now removed from any pack installed from a `github:`, `gitlab:`, or `git+...` source unless you opt in. These three files control your agent's tool settings (shell hooks, granted permissions, MCP launch specs) and a malicious pack shipping any of them could otherwise execute arbitrary local commands the next time the matching event fires. Opt in per-artifact with `--accept-hooks`, `--accept-permissions`, `--accept-mcp`, or all three with `--accept-elevated`. Local sources remain trusted as before.
  - **Skill supporting-file traversal no longer follows symlinks.** A pack containing `skills/foo/keys -> /Users/victim/.ssh` previously pulled external bytes (private keys, etc.) into the canonical skill content. Skill traversal now uses the existing `readDirRecursiveNoSymlinks` helper, mirroring the hardening already applied to install-manifest hashing.
  - **Redact credentials from remote-fetch error output.** `oauth2:<token>@`, `x-access-token:<token>@`, and any other userinfo-bearing URLs are now masked (`https://***@host/...`) in console warnings and thrown error messages so GitHub PATs and GitLab tokens never leak into CI logs, terminal scrollback, or log shippers.
  - **Gate `git+file://` sources behind `AGENTSMESH_ALLOW_LOCAL_GIT=1`.** On shared/multi-tenant hosts a `git+file:///tmp/world-writable-repo` `extends:` clause could silently consume a repo planted by another user; combined with downstream elevated-artifact emission this was a local priv-esc vector. Set `AGENTSMESH_ALLOW_LOCAL_GIT=1` to enable for closed-network development.
  - **Allowlist tar entry types on GitHub tarball extraction.** Previously only `Link` and `SymbolicLink` were rejected (denylist). Now only `File` and `Directory` entries extract; FIFOs, devices, hardlinks, and any future/exotic tar variant are rejected by default.

  These changes apply to `agentsmesh install`, `agentsmesh refresh`, and any `extends:` resolution against a non-local source. They are behavior changes for users who were silently inheriting hooks/permissions/mcp from a remote pack — re-run with the matching `--accept-*` flag (or `--accept-elevated`) to preserve previous behavior intentionally.

## 0.20.0

### Minor Changes

- 6739c63: feat(refresh): add `agentsmesh refresh` to re-fetch and re-apply installed packs

  A new top-level CLI command and MCP tool for keeping installed packs in
  sync with their declared sources. Branch pins re-resolve to the current
  tip; tag pins re-resolve in case the tag moved; SHA pins stay put. Per-pack
  atomic via the existing `materializePack` swap — a failure or interruption
  leaves the affected pack at its pre-refresh state.

  ```
  agentsmesh refresh                          # refresh every installed pack
  agentsmesh refresh my-pack,other-pack       # refresh just these
  agentsmesh refresh --dry-run                # preview without writing
  agentsmesh refresh --force                  # skip the drift consent prompt
  agentsmesh refresh --json                   # JSON output (implies --force)
  agentsmesh refresh --global                 # global scope
  ```

  **MCP parity:** new `mcp__agentsmesh__refresh` tool with the same
  `{ names?, dry_run?, global? }` input shape MCP install/uninstall use.
  `force: true` is implicit (no TTY). Errors map to two new codes —
  `REFRESH_RESOLVE_FAILED` and `REFRESH_APPLY_FAILED` — plus the existing
  `LOCK_HELD` and `IO_ERROR`.

  **Drift handling:** modified pack files trigger a consolidated consent
  prompt with a 5-minute timeout (default no). `--force` bypasses the prompt
  and overwrites local edits. The prompt is collapsed across packs so a bulk
  refresh asks once, not N times.

  **Schema additions** (`installs.yaml`, all optional, backwards-compatible):
  - `original_ref?: string` — the user's original ref expression (e.g.
    `main`, `v1.2.3`) captured at install time. Used by refresh to
    re-resolve branch pins. Absent on installs predating this release;
    refresh becomes a deterministic no-op for those rows.
  - `refreshed_at?: string` — ISO-8601 timestamp of the last successful
    refresh. Surfaces in `installs list` under the "LAST TOUCHED" column
    (falls back to `installed_at` when absent).

  **Behavior changes that could affect existing consumers:**
  - `installs.yaml` rows written by this release include `original_ref`.
    Pre-existing rows continue to parse and behave identically.
  - `--json` on `agentsmesh refresh` implies `--force` (CI/MCP can't
    answer the consent prompt). Documented on the website CLI reference.
  - `installs list` column header was "INSTALLED AT", now "LAST TOUCHED",
    showing `refreshed_at` when present and `installed_at` otherwise.

  **Architecture notes:**
  - `installAsPack` gains an optional `forceFreshMaterialize` flag,
    threaded through five layers (`install-flags → run-install →
run-install-locked → single-pack-install → run-install-execute →
installAsPack`). Default is false; install's existing flow is
    untouched. Refresh sets the flag to bypass the
    merge-into-existing-pack branch and force atomic replacement via
    `materializePack`.
  - Source-URL parsing is now shared between install and refresh via the
    new pure `parseSourceUrl` helper (`src/install/source/parse-source-url.ts`).

  **Refresh does NOT switch refs.** To move a pack to a different ref,
  re-run `agentsmesh install <source>@<new-ref>` — install silently
  overwrites an existing pack of the same name.

  **Refresh vs `install --sync`** are orthogonal. `--sync` replays missing
  installs from `installs.yaml` (fresh clone). `refresh` updates existing
  installs against their declared sources.

  Verified end-to-end against 64 community packs from the install
  compatibility log spanning Anthropic skill-packs, marketplaces (`--all`),
  canonical mixed packs, flat collections, root SKILL.md, root CLAUDE.md,
  manual `--path`/`--as`/`--target` combinations, and packs using `pick`
  selectors. Full unit/integration/e2e suite green (7700+ tests).

## 0.19.1

### Patch Changes

- 041b9c5: fix(security): plug input/path/proto-pollution holes in plugin, install, MCP, and config

  Closes a batch of security audit findings (2 HIGH + 5 MEDIUM):
  - **Plugin source containment** (`src/plugins/load-plugin.ts`) — local plugin
    sources are now resolved with `realpath` and rejected when they escape
    `projectRoot`. A hostile `agentsmesh.yaml` with
    `plugins[].source: "../../tmp/evil.js"` no longer reaches dynamic
    `import()`. Bare npm specifiers continue to resolve through
    `node_modules/<source>`. Both sides are canonicalized so macOS
    `/tmp -> /private/tmp` (and other platform-level symlinks) do not
    produce false positives.
  - **Prototype pollution denylist** (`src/config/core/loader.ts`) —
    `deepMergeObjects` over `agentsmesh.local.yaml` now skips `__proto__`,
    `constructor`, and `prototype` keys. Defense-in-depth: the `yaml` v2
    parser already strips `__proto__`, but this pins the invariant against
    future parser swaps.
  - **Install manifest name validation** (`src/install/core/install-manifest.ts`) —
    `installManifestEntrySchema.name` now refuses path separators, NUL,
    and `.`/`..` segments. A poisoned `installs.yaml` entry can no longer
    drive `rm -rf` outside `.agentsmesh/packs/` at uninstall time.
  - **`git+http://` allowlist** (`src/config/remote/remote-source.ts`) —
    rejected by default; opt-in via `AGENTSMESH_ALLOW_INSECURE_GIT=1` for
    closed-network development. `https://`, `ssh://`, and `file://` are
    unchanged. Closes a MITM window before SHA pinning resolves.
  - **MCP `cwd` / `description` refinement** (`src/mcp/schemas.ts`) — `cwd`
    rejects `..` segments (POSIX + Windows separators), NUL, and newlines;
    `description` rejects NUL and newlines. MCP clients can no longer
    plant a structurally-escaping working directory that downstream agents
    consume via `spawn(command, args, { cwd })`.
  - **Global path redaction in MCP errors** (`src/mcp/errors.ts`) —
    `redactAbsolutePaths` now strips paths anywhere in the string, catching
    embedded paths in stack frames (`at Foo (/Users/...)`) and quoted
    paths in Node errors (`ENOENT, open '/Users/...'`) the prior
    whitespace-anchored regex missed.
  - **`copyDir` symlink hardening** (`src/utils/filesystem/fs-traverse.ts`) —
    `copyDir` now uses `lstat` and skips symlinks. A symlink in the source
    tree pointing outside its root can no longer have its target's bytes
    exfiltrated into the destination (and into any redistributed pack
    built on top of it).

  Behavioral changes that could affect existing consumers:
  - `git+http://...` extends/installs require `AGENTSMESH_ALLOW_INSECURE_GIT=1`.
  - MCP server entries with `cwd: "../foo"` no longer parse — rewrite as a
    POSIX-relative path without `..` segments.
  - Plugin `source:` entries pointing outside the project tree no longer
    load. The standard `node_modules/<plugin>` and project-local layouts
    are unaffected.
  - A poisoned `installs.yaml` entry whose `name` contains separators or
    `..` is now dropped at parse time (the rest of the manifest survives).
  - A `agentsmesh.local.yaml` payload at `__proto__`, `constructor`, or
    `prototype` keys is silently dropped instead of merged.

  Branch coverage > 95% on every touched file; full unit/integration suite
  (7596 tests) and plugin e2e suite (57 tests) green.

## 0.19.0

### Minor Changes

- 879eeed: refactor(install): every install-time command-directory read now delegates to per-target importer mappers

  The previous skill-pack-aggregator refactor wired the target-mapper
  delegation seam (`hasToolNativeCommandImporter` + `readToolNativeCommands`)
  into exactly one call site: `mergeCommands`. The canonical / manual /
  flat-collection install paths still routed through plain `parseCommands`
  (`.md`-only), so a root-level `commands/*.toml` (Gemini CLI's native
  format) on `JuliusBrussee/caveman` and similar repos was silently dropped
  with a "Skipped N commands file(s) ... format: .toml" warning, even though
  the gemini-cli descriptor already ships a TOML-aware mapper.

  This change generalizes the seam into a single shared helper
  (`readCommandsDirWithMappers`) used by every install-time read:
  - **`src/install/importers/target-native-commands.ts`** gains
    `readCommandsDirWithMappers(srcDir, { restrictToTarget?, parseOpts? })`.
    When `restrictToTarget` is set (per-tool dir like `.gemini/commands/`),
    only that target's mapper runs. When unset (canonical root `commands/`),
    every registered target's non-`.md` mapper is tried; canonical `.md`
    wins on basename collision so dedup-log readability is preserved.
  - **`src/canonical/load/load-canonical-slice.ts`** now returns
    `{ canonical, cleanup }` and takes an `enableTargetCommandMappers` flag.
    Install-path callers (`discoverFromContentRoot`) set it; the extends
    path leaves it off to preserve the historical `.md`-only behavior and
    avoid the tmpdir staging lifecycle (extends would need cross-load
    cleanup tracking that isn't worth the complexity for a rare edge case).
  - **`src/sources/anthropic-skill-pack/merge-commands.ts`** drops its
    bespoke per-spec loop and routes every spec — canonical root `commands/`
    and per-tool dirs alike — through the shared helper.
  - **`src/install/run/run-install-discovery.ts`** and
    **`src/install/manual/manual-install-discovery.ts`** merge the slice's
    staging cleanup into the existing `prep.cleanup` lifecycle.

  Result on `JuliusBrussee/caveman`: install with no flags previously
  produced `7 skills + 3 agents` and warned about 4 TOML commands; now
  installs `7 skills + 4 commands + 3 agents`, no warning, no flag needed.
  Verified end-to-end (`Installed 7 skills, 4 commands, 3 agents`).
  `addyosmani/agent-skills` (the original skill-pack test) remains at
  `23 skills, 8 commands, 3 agents` — no regression.

  Architectural payoff: adding a future target whose commands use a
  non-Markdown format is now a one-place change in that target's
  descriptor. The aggregator and every install path automatically pick up
  the new format via the shared seam.

- 3b6af70: feat(install): detect upstream SPDX license at pack-creation time and surface it in `agentsmesh installs list`

  Every `agentsmesh install <source>` now probes the materialized pack root for a `LICENSE` / `COPYING` / `NOTICE` / `COPYRIGHT` file (across `.md` / `.txt` / `.rst` / no-extension variants) and runs a conservative SPDX detector against the bytes. The detector recognizes the dozen most common OSI/SPDX licenses by their canonical text fingerprints (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, GPL-2.0, GPL-3.0, LGPL-2.1, LGPL-3.0, AGPL-3.0, MPL-2.0, ISC, CC0-1.0, Unlicense) plus the explicit `SPDX-License-Identifier:` header. Unknown text resolves to `null` — better to say "unknown" than mislabel exotic terms.

  The detected identifier is recorded in `pack.yaml#license`, propagated through `InstallsListEntry`, and rendered as a new `LICENSE` column in `agentsmesh installs list` (and JSON output). Lets you scan installed packs and spot proprietary or unknown-terms upstreams at a glance before relying on them.

  Pack metadata schema is additive (`license` is optional) and prior `pack.yaml` files keep parsing — no migration needed.

- 975bdb5: Skill-pack-aware install pipeline, new `uninstall` and `installs` commands, descriptor-driven target dispatch refactors, and a senior-architect hardening pass. Roll-up of every change on `develop` since `v0.18.1`.

  ## New commands

  ### `agentsmesh install <url>` (extended)

  Now auto-detects three source shapes via a multi-signal classifier (`src/install/classify/`) and dispatches accordingly:
  - **`anthropic-skill-pack`** — imports root `skills/`, `agents/`, `references/`, merged per-target `.claude/commands/` + `.gemini/commands/`, and multi-tool rule files as one bulk set. A single command imports the full pack (e.g. all 23 skills + 3 agents + 7 commands of `addyosmani/agent-skills`); pre-change behaviour required 7+ invocations with `--as`.
  - **`canonical-agentsmesh`** — unchanged.
  - **`tool-native`** — unchanged. Five backcompat fixtures (`tests/integration/install-backcompat.integration.test.ts`) pin the discriminator threshold so legacy repos take their original path.
  - **`unknown`** — unchanged canonical-slice fallback.

  The discriminator threshold (sum of matched signal weights ≥ 1.4 with the primary `skills/<kebab>/SKILL.md` signal present) makes false positives essentially impossible on tool-native or canonical repos. `--target` and `--as` keep their explicit-override semantics and skip the classifier.

  When classified as a skill pack and a TTY is attached, two interactive prompts surface:
  - **Bulk select (three tiers)** — `[a]ll / [n]one / [s]elect per type` summary banner → per-type `[y/n/c]` → per-entity `[y/N/a=accept-all-remaining/q=skip-all-remaining]`. `--force`, `--json`, and non-TTY contexts accept everything.
  - **Broken-link (three options)** — for body links that point outside the imported subtree, classify each as in-tree-included / resolvable-outside / unresolvable and cluster per entity. `[i]nclude resolvable as supporting files / [l]eave with warnings / [a]bort install`. `--force` defaults to `[l]eave-with-warnings`.

  New flags:
  - `--all` — install every sub-pack from a `.claude-plugin/marketplace.json` source.

  Other install improvements:
  - **Source-layout detection covers community-repo shapes**: root-level `SKILL.md` (`blader/humanizer`), root `.cursorrules` / `.windsurfrules` (`PatrickJS/awesome-cursorrules` style), nested marketplace plugin trees (`.claude-plugin/marketplace.json`), and arbitrary 2+ sub-pack directory layouts. The picker is descriptor-driven via `selectInstallCandidates`.
  - **Concurrent-install lock** — `.agentsmesh/.install.lock` is acquired at the top of any `install` or `uninstall` run (and held across `--sync` replay). Concurrent invocations on the same project fail fast with `LockAcquisitionError` rather than racing on filesystem writes.
  - **Pack writes are atomic** via staging-dir + rename. Each install now writes `.agentsmesh-install-manifest.json` next to the pack with the install-time `name`, `source`, `installed_at`, classifier verdict (`source_type`), and per-file `sha256:` map.
  - **Pack-name preservation across URL variants** — `findExistingInstallName` (`src/install/core/install-name.ts`) keys reuse on canonical `github:<org>/<repo>` plus identity scope (`target + as + features`), so `https://`, `git@`, and `github:` spellings of the same source dedupe into one pack. The `git+` prefix is now stripped iteratively (no recursion, safe under malicious manifest input).
  - **Lenient frontmatter parsing for all third-party imports** — `readSkillFrontmatterName` and `inferMdcTarget` skip files with invalid YAML and continue, rather than aborting the whole install on one bad scalar.
  - **Flat-collection basename collisions** — when two `--as <kind>` flat-collection files share a basename, names are namespaced rather than dropped silently.
  - **`--path`, `--target`, `--as` flags** — all trimmed symmetrically; empty/whitespace-only values now correctly normalise to "not provided" inside recursive auto-pick calls.

  ### `agentsmesh uninstall <name>[,<name>...]` (NEW)

  Removes one or more installed packs:
  - `rm -rf .agentsmesh/packs/<name>/`.
  - Drops the row from `installs.yaml`.
  - Drops the matching `extends:` row from `agentsmesh.yaml` when present (`install --extends` is now uninstallable).
  - Runs `generate` so `cleanupStaleGeneratedOutputs` evicts orphaned target files.

  Flags: `--all`, `--keep-pack` (leave pack on disk; only drop yaml entries), `--keep-generated` (skip the final generate; warn about stale targets), `--global`, `--dry-run`, `--force`, `--json`. The `--keep-pack` flag also doubles as the apply-layer equivalent of the interactive `[k]eep-modified` action. `--force` is implied by `--json`.

  Pre-uninstall **drift check** compares the current pack contents against `.agentsmesh-install-manifest.json`. When drift is detected, a modified-files prompt offers `[d]elete-anyway / [k]eep-modified / [a]bort`; `--force` defaults to `[d]`. Legacy packs (no manifest) auto-migrate at uninstall time — current contents become the baseline; a warning makes this explicit. Exit `130` on user-aborted prompt; `0` on success or `--dry-run`.

  **Mid-batch failure isolation** — if `applyUninstall` throws for one pack, survivors continue. The failure lands in a new `data.failed[]` envelope; post-operation `generate` still runs over the packs that succeeded so the tool tree stays consistent with the (possibly partially mutated) `installs.yaml`. Exit code is `1` when any pack failed.

  **`--dry-run uninstall` is a true no-op** — the legacy-manifest migration computes the baseline in memory but does NOT persist `.agentsmesh-install-manifest.json` to disk under `--dry-run`.

  ### `agentsmesh installs list` (NEW)

  Read-only inventory. Reads `installs.yaml`, hydrates `installed_at` + `source_type` from each pack's manifest, and emits either a space-padded `NAME / SOURCE / FEATURES / INSTALLED` table or a JSON envelope. Empty list exits 0. Forward-slash `pack_path`. `--global` reads from `~/.agentsmesh/installs.yaml`. The plural-vs-singular typo (`installs` vs `install`) surfaces a "did you mean `install`?" hint on unknown subcommands. Help banner comes from the central `help-data.ts` (single source of truth).

  ## Reliability fixes (broken-link rewriter)

  Two silent data-corruption bugs in the skill-pack broken-link `[i]nclude` flow are now fixed:
  - **Verbatim destination matching** — body rewrites match `ScannedLink.raw` (the as-authored text), not a normalized form. Bodies authored with `{baseDir}/foo.md` or Windows-style `..\refs\x.md` previously copied the supporting file but silently skipped the body rewrite, leaving an orphan `references/<basename>` plus a still-broken link. Both forms now rewrite correctly.
  - **Basename-collision disambiguation** — two distinct outside paths sharing a basename (`docs/A/README.md` + `docs/B/README.md` → `references/README.md`) previously dropped the second file's bytes and pointed both citations at the same target. Names are now slugged from the full `resolvedRelative` on collision (`references/docs-A-README.md`, `references/docs-B-README.md`).

  ## Drift-detection robustness
  - **CRLF / BOM normalization** — `hashFileForManifest` (`src/utils/crypto/hash.ts`) normalizes `\r\n?` → `\n` and strips a leading UTF-8 BOM for text-extension files (`.md`, `.json`, `.yaml`, etc.) before hashing. A Windows editor saving CRLF or a tool prepending a BOM no longer registers as drift. Binary files are still hashed as raw bytes.
  - **Symlink-safe traversal** — install-time pack hashing and uninstall-time drift detection now use `readDirRecursiveNoSymlinks`. A symlink that used to be followed at install (silently absorbing external bytes into the hash) only to be unlinked-without-following at uninstall (`rm` removes the link, not the target) no longer produces a permanent drift-detection mismatch.

  ## IDE auto-config via in-file schema directives (NEW)

  Every YAML / JSON file the CLI writes is now stamped with an editor-recognizable schema directive so VSCode (Red Hat YAML extension), JetBrains IDEs, vim/neovim with `yaml-language-server` / `coc-json`, and the GitHub Actions YAML editor get autocomplete + validation immediately — **no IDE configuration required**.

  YAML files get a top-of-file comment:

  ```yaml
  # yaml-language-server: $schema=https://unpkg.com/agentsmesh@<version>/schemas/<name>.json
  version: 1
  ...
  ```

  JSON files get a top-level `$schema` field. URLs are pinned to the running package version so the schema referenced always matches the format the file was written with; older files keep working pointed at their original schema until a writer touches them again.

  Stamped files:
  - `init` writes — `agentsmesh.yaml`, `agentsmesh.local.yaml`, `.agentsmesh/hooks.yaml`, `.agentsmesh/permissions.yaml`.
  - `install` writes — `.agentsmesh/installs.yaml`, `.agentsmesh/packs/<name>/pack.yaml`, `.agentsmesh/packs/<name>/.agentsmesh-install-manifest.json`.
  - `uninstall` refreshes — `.agentsmesh/installs.yaml` after row removal.

  Implementation: a single helper module `src/utils/output/schema-directive.ts` exports `prependYamlSchemaDirective`, `stampJsonSchemaField`, `schemaUrl`, and `yamlSchemaDirective`. Each is idempotent — re-running a writer on a file that already carries the directive updates the URL in place rather than duplicating the line. New reference page at `reference/json-schemas.mdx` documents all four IDE mechanisms (in-file directive, `$schema` field, VSCode workspace settings, SchemaStore.org plans), CI validation examples, and troubleshooting. The getting-started installation guide expands the existing IDE-autocomplete section to mention the new `installs` and `install-manifest` schemas.

  ## Published JSON Schemas — required-field correctness (FIX)

  A long-standing bug in the published `schemas/*.json` files marked every field with a `.default(...)` in its Zod source as `required: true`. Editors then complained about valid minimal configs (e.g. an `agentsmesh.yaml` with just `version: 1` was flagged as "Missing required properties: overrides, pluginTargets, plugins"). The runtime parser substituted the documented default in every one of these cases — only the published schema disagreed.

  Fixed by a post-processor in `src/schemas/schema-generator.ts::stripRequiredFromDefaults` that walks the emitted JSON Schema and strips defaultable fields from every `required` array. The Zod source schemas keep plain `.default(...)` (so the parsed TS type stays `T`, never `T | undefined`); the publishing layer alone reconciles "default present" with "user MUST provide". `buildAllSchemas()` calls the post-processor for all seven schemas. New regression test asserts the top-level `agentsmesh.json` required list collapses to `['version']`. Verified: `pnpm schemas:generate` produces correct `required` arrays:
  - `agentsmesh.json`, `installs.json` — only `version`
  - `permissions.json`, `hooks.json`, `mcp.json` — no required (everything has a default)
  - `pack.json`, `install-manifest.json` — required = the documented structural fields, unchanged

  ## Published JSON Schemas (NEW)

  Two new entries in the published `schemas/` directory (already shipped via `package.json`'s `files` array) cover the two new file formats introduced in this release:

  | File                            | Documents                                                                                                                                                                                           |
  | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `schemas/installs.json`         | `.agentsmesh/installs.yaml` — the install manifest that records every materialized pack so `--sync` can replay them post-clone.                                                                     |
  | `schemas/install-manifest.json` | `.agentsmesh/packs/<name>/.agentsmesh-install-manifest.json` — per-pack integrity manifest (install-time provenance + per-file `sha256:` map used by `uninstall` to detect locally-modified files). |

  Both schemas are generated from their respective Zod sources (`installManifestSchema` in `src/install/core/install-manifest.ts`; `installManifestFileSchema` in `src/install/manifest/install-manifest-hash.ts`) and verified by the existing schema-freshness test, which now covers all seven published schemas (was five).

  Editors / GitHub schema validators that wire `$schema: https://unpkg.com/agentsmesh/schemas/installs.json` (or the corresponding install-manifest URL) get autocomplete and validation for these files; CI tools can use them to assert pack provenance without hand-coded JSON-shape checks. `buildAllSchemas()` and the `pnpm schemas:generate` script now produce **7 JSON schemas** instead of 5.

  ## MCP server — pack lifecycle tools (NEW)

  The built-in `agentsmesh mcp` server now exposes three additional tools so AI agents speaking MCP can install, uninstall, and inspect community packs without leaving the conversation:

  | Tool            | Purpose                                                                                                                         |
  | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | `install`       | Install a community pack from a URL or local path. Auto-classifies the source layout; `target` / `as` overrides the classifier. |
  | `uninstall`     | Remove one or more installed packs. Mid-batch failures isolated; survivors continue.                                            |
  | `installs_list` | Read-only inventory of installed packs (also exposed as `agentsmesh://installs` resource).                                      |

  All three run with `force: true` internally — MCP has no stdin TTY, so the documented `--force` defaults are accepted for every interactive prompt the CLI would surface (bulk select → accept all, broken-link → leave-with-warnings, modified-files → delete-anyway). Input shapes mirror the CLI flags one-for-one; output envelopes match `InstallData` / `UninstallData` / `InstallsListData`.

  Tool count moves from **41 → 44**; resource count moves from **16 → 17**. The MCP docs reference and the in-tree `register` / `tool-tables-sweep` contract tests are updated to match.

  ## Programmatic / JSON-envelope additions (additive)

  New required fields on public types. JSON readers are unaffected (additive); TypeScript code constructing these types directly needs to populate the new fields:

  | Type                    | New field                         |
  | ----------------------- | --------------------------------- |
  | `UninstallData`         | `failed: Array<{ name; reason }>` |
  | `UninstallRemovedEntry` | `partial: boolean`                |
  | `AppliedRemoval`        | `partial: boolean`                |

  `partial` lets JSON consumers distinguish a fully-clean removal from one where bytes were kept by design (`--keep-pack`, `[k]eep-modified`) or where a step silently no-op'd (no matching extends row, missing pack dir, etc.).

  ## Descriptor-driven target dispatch (internal refactor)

  Several install-layer behaviours that previously branched on hardcoded target IDs in shared code now read directly from the relevant target descriptor:
  - **Native-format detection** — `src/config/resolve/native-format-detector.ts` walks `descriptor.detectionPaths` instead of a hand-maintained per-target table.
  - **Native importer dispatch** — `src/install/native/native-importers.ts` looks up the importer via the descriptor registry.
  - **Command directories** and **starter exclusions** — derived from each descriptor's `managedOutputs.dirs` and `excludeFromStarterInit` flag.
  - **Conversion defaults** — `commands_to_skills` / `agents_to_skills` defaults now live on each descriptor's `conversionDefaults`, removing duplicated per-target enable lists.
  - **Path-to-target hint map** — built at module load from descriptor `managedOutputs.dirs` patterns matching `^\.[^/]+\/(rules|commands|agents|skills)$`.

  Plugin descriptors transparently inherit all of these capabilities.

  ## Schema tightening (BREAKING for plugin authors)

  **`validateDescriptor()` now requires `metadata`:**

  ```ts
  metadata: {
    displayName: string;
    category: 'cli' | 'ide' | 'agent-platform';
    officialUrl: string;
    shortDescription: string;
  }
  ```

  Plugins built against earlier versions will fail to register at runtime until the descriptor adds the `metadata` block. All bundled plugin fixtures + the 30 built-in target descriptors already include it.

  The Zod schema also now models `emitScopedSettings`, `mergeGeneratedOutputContent`, `postProcessHookOutputs`, and `preservesManualActivation` (previously laundered away by a `passthrough()` + cast).

  ## Operational polish
  - **`AGENTSMESH_MAX_TARBALL_MB`** env var caps GitHub tarball acceptance (default 500, range 1-4096). Set higher for large monorepo installs.
  - **`AGENTSMESH_STRICT_PLUGINS=1`** turns plugin descriptor import failures from warning-and-skip into hard errors (CI gate).
  - **Best-effort post-install / uninstall generate** — when the post-operation `generate` pass fails (e.g. lock contention), the surrounding `install` / `uninstall` exits cleanly with a warning rather than reverting the install/uninstall work.
  - **First-time install on a fresh project** — `acquireInstallLock` now `mkdir`s the canonical dir before writing the lockfile, eliminating an ENOENT failure when no `.agentsmesh/` exists yet.
  - **`agentsmesh install --json` and `agentsmesh uninstall --json`** — validation errors and per-pack failures no longer leak to stderr; they go only into the JSON envelope's `error` / `failed[]` fields. Wrappers that were grepping stderr for error text should read the envelope.
  - **Forward-slash paths** — every CLI display string normalizes `\\` → `/`.

  ## Internals

  New files (selection): `src/install/classify/{types,signals,classify-source,layout-detect,layout-types,marketplace-manifest}.ts` and `src/install/classify/detectors/{fs-helpers,root-shape,collections}.ts`; `src/install/importers/{boilerplate-filter,entity-importers}.ts`; `src/install/lock/install-lock.ts`; `src/install/prompts/{prompt-io,prompt-types,bulk-prompt,broken-link-prompt,modified-files-prompt}.ts`; `src/install/links/{scan-relative-links,resolve-link}.ts`; `src/install/manifest/install-manifest-hash.ts`; `src/install/picker/select-candidates.ts`; `src/install/run/{single-pack-install,route-picker-result,run-install-marketplace,run-install-prompts,run-install-sync-locked,post-install-generate,install-abort-error}.ts`; `src/install/uninstall/{plan-uninstall,detect-modified,legacy-manifest-migration,uninstall-decisions,apply-uninstall,uninstall-result,run-uninstall}.ts`; `src/install/core/{install-target,install-report,pick-reuse-entry-name,remove-extend-entry}.ts`; `src/sources/anthropic-skill-pack/{index,aggregate,merge-commands,link-scan,apply-decisions}.ts`; `src/cli/commands/{uninstall,installs,installs-list}.ts`; `src/cli/renderers/{uninstall,installs}.ts`; `src/utils/filesystem/fs-traverse.ts::readDirRecursiveNoSymlinks`; `src/utils/crypto/hash.ts::hashFileForManifest`.

  File-size discipline (per the project's 200-line cap): `layout-detect.ts` (244 → 116 lines) split into `detectors/` modules; `run-install-locked.ts` (295 → 180 lines) split into `single-pack-install.ts` + `route-picker-result.ts`.

  Coverage: unit-test branch coverage held at 95% across the included set. New: 30+ unit suites and 17 integration tests covering anthropic-pack imports, broken-link / bulk prompt force paths, targeted overrides, backcompat across 5 tool-native fixtures, pack-name preservation, atomicity, every uninstall scenario, `installs list` round-trip, lock contention, marketplace recursion, failure-isolation, dry-run no-op, and CRLF/BOM/symlink hash invariants. Watch-test scheduler envelope hardened (chokidar polling forced in test harness; describe-level timeouts widened).

  Docs: new `cli/uninstall.mdx`, `cli/installs.mdx`, `guides/installing-skill-packs.mdx`, and `docs/architecture/install.md`; expanded `cli/install.mdx`; README env-var table; lessons-file additions documenting the lenient-frontmatter contract, the circular-import trap in target descriptor evaluation, and the FSEvents flake fix.

  ## Upgrade notes
  1. **Plugin authors must add a `metadata` block** to each `TargetDescriptor`. Validation rejects descriptors without it.
  2. **Packs installed before this version** may report some text files as `modified` on the first `uninstall` after upgrade if their content contains CRLF or a BOM. The standard `[d]elete-anyway / [k]eep-modified / [a]bort` prompt covers it (or use `--force` to accept the default). No data is lost. Installs created after upgrade use the new hashing algorithm consistently.
  3. **CI wrappers parsing `--json`** should read errors from the envelope's `error` field rather than scraping stderr.

  ## Deferred to a follow-up

  `src/install/native/native-path-pick-infer.ts` still hardcodes per-target dir prefixes for 8 targets (`gemini-cli`, `claude-code`, `cursor`, `copilot`, `windsurf`, `cline`, `continue`, `junie`, `codex-cli`). The descriptor-driven refactor touches all 27 builtin descriptors plus the three bespoke-layout targets and is tracked separately in `tasks/todo.md`. The file remains in the coverage exclude list with a `category 5` comment until refactored.

- 7cd2c3e: refactor(install): make the skill-pack aggregator delegate per-tool command reads to that target's importer mapper

  `mergeCommands` (the Anthropic skill-pack aggregator's command merger) previously routed every per-tool directory through the canonical `.md`-only parser. That worked for `.claude/commands/` (Claude Code commands are Markdown) but silently dropped `.gemini/commands/*.toml` because Gemini CLI's slash-command format is TOML, not Markdown — even though the gemini-cli target descriptor already ships a TOML-aware mapper (`mapGeminiCommandFile` + `geminiCommandMapper`).

  The aggregator now treats the `target` field on each `CommandMergeSpec` as load-bearing: when set and the target ships a directory-mode command importer with non-`.md` extensions, the aggregator delegates non-`.md` reads to that target's mapper (via the new `readToolNativeCommands`). Markdown files keep going through the canonical reader so dedup metadata keeps pointing at the upstream `.gemini/commands/foo.md`-style path.

  Knock-on cleanups:
  - New `src/install/importers/target-native-commands.ts` — single owner of "read a tool-native command directory through that tool's mapper". Both the descriptor-driven full install (`runDescriptorImport`) and the skill-pack aggregator now share this seam, so adding a new target whose commands aren't Markdown means writing one mapper in that target's descriptor — no aggregator change.
  - `aggregateAnthropicSkillPack` now returns a `cleanup` callback that removes any temp staging directories created by per-target mappers. Wired through the existing `prep.cleanup` lifecycle so `runSinglePackInstall`'s `finally` block runs it after pack materialization.
  - `parseCommands` learns a `handledByOtherReader` option so the canonical reader's "skipped N command file(s)" warning is suppressed for extensions another reader (the per-target mapper) actually consumes.

  Side effect on `addyosmani/agent-skills` and similar multi-tool skill packs: the seven `.gemini/commands/*.toml` files now merge into the canonical command set alongside Claude's `.md` commands instead of triggering the "Skipped 7 commands file(s) … format: .toml" warning. Verified end-to-end: `installs list` shows `8 commands` (4 Claude + 7 Gemini deduped on basename collision), and the previously-dropped Gemini commands are present in `pack/commands/`.

### Patch Changes

- 4c39bd4: fix(install): compound `.md` extensions (e.g. `.agent.md`) stay on the canonical reader

  `hasNonMdEntityMapper` and friends in
  `src/install/importers/target-native-commands.ts` previously asked
  `ext !== '.md'` to decide whether a target's extension was
  "non-Markdown". That treated Copilot's `.agent.md` (a Markdown
  sub-extension Copilot uses to mark agent files) as non-Markdown and
  routed those files through Copilot's importer mapper **in addition**
  to the canonical reader. For any repo containing `foo.agent.md`, two
  canonical agents were emitted: one slugged `foo.agent` (canonical
  read) and one slugged `foo` (Copilot mapper). Surfaced during the
  `VoltAgent/awesome-claude-code-subagents` compatibility sweep when
  the same input started producing two extra agents per `.agent.md`
  file.

  Now uses `ext.toLowerCase().endsWith('.md')`, so any `.<sub>.md`
  compound stays on the canonical reader and the seam only fires for
  genuinely non-Markdown formats (`.toml`, `.mdc`, `.yaml`, `.json`).
  Pinned by a regression test in
  `tests/unit/install/importers/target-native-commands-plugin.test.ts`
  ("compound .md extensions ... stay on the canonical reader — no
  double-counting"), plus the existing per-kind plugin tests for
  `.yaml`-extension plugins still pass unchanged.

  Also includes the dedup-key change from the same commit: entities are
  now deduped by source-file basename slug (matches the canonical
  parser's `basename(path, '.md')` convention). Required because
  `CanonicalRule` doesn't carry a `name` field — the prior
  `entity.name`-keyed `Map` would collapse every rule into a single
  entry. Fixes a separate latent issue on rule installs.

- a3e5686: fix(install): skip preserved boilerplate (README/LICENSE/NOTICE/COPYING/COPYRIGHT) in native descriptor import

  Native-import directory mode (`runDirectory` in `descriptor-import-runner.ts`) previously materialized every `*.md` under `.claude/agents/`, `.claude/commands/`, and `.claude/rules/` as a canonical entity. Repos that ship folder-level documentation alongside content (e.g. `.claude/agents/README.md` and `.claude/agents/external/README.md` in `qdhenry/Claude-Command-Suite`) tripped the basename-slug collision check at parse time and hard-failed the install. The runner now consults `isPreservedBoilerplate` and silently drops those files — matching the existing filter applied via `entity-importers.ts` in the install-discovery path. Noise stems (`security`, `contributing`, …) are intentionally left through so user-authored rules like `.claude/rules/security.md` continue to import.

- fc3ec85: fix(install): surface recovery flags in every "no installable resources" error and document the auto-detect → flag fallback chain

  `agentsmesh install <source>` runs the classifier first and falls back to user-supplied flags (`--path`, `--as`, `--target`, `--all`) when auto-detection refuses a source or can't disambiguate it. Three error paths used to dead-end without naming those flags, leaving the user stuck:
  - `No installable files found under <path> for manual install` — now also says: _Try a different `--path`, or omit `--as` to let agentsmesh auto-detect the layout._
  - `No installable native resources found under "<path>" for target "<id>"` (both call sites) — now also says: _Try `--path <dir>` without `--target` for auto-detection, or `--as <kind>` for a flat-collection override._
  - `No installable resources after skipping invalid files (N): …` — now also says: _Fix the frontmatter in the source files (most often: unquoted scalars with embedded colons or square brackets), or narrow `--path` to a subdirectory that excludes them._

  The `agentsmesh install --help` description now spells out the precedence — auto-classify first, then `--path` / `--as` / `--target` / `--all` to override — instead of just listing flags alphabetically.

  Regression tests pin the flag names (not literal phrasing) so the contract stays visible even if future copy-edits rework the sentences.

- 4c39bd4: fix(reference): classify `(filename)` prose as bare-prose, not a Markdown link destination

  `shouldRewritePathToken`'s `(`-branch in
  `src/core/reference/link-token-context.ts` unconditionally treated any
  token preceded by `(` as a Markdown link destination, regardless of
  whether the `[label]` prefix was actually present. Prose mentions
  like `Read the existing spec (SPEC.md or equivalent)` were routed to
  the link-rewrite path; the rebaser then resolved `SPEC.md` against
  the canonical pack's `commands/` dir (case-insensitive on macOS APFS
  / Windows NTFS) and emitted `(../../.agentsmesh/.../SPEC.md or
equivalent)` into every generated `.claude/commands/`,
  `.gemini/commands/`, `.cursor/commands/` artifact (etc.). The leaked
  path was wrong even by intent — the author meant the filename as a
  documentary mention, not a link target.

  The matching guard in `getTokenContext` (same file, line 64) already
  encodes the correct rule: a token is `markdown-link-dest` only when
  `]` sits directly before the `(`. This change propagates that rule
  into `shouldRewritePathToken`:
  - With `]` immediately before `(` → real Markdown link, accept any
    terminator (`)`, `#`, `?`, space, tab) — `[text](spec.md)`,
    `[text](spec.md#anchor)`, etc. continue to rewrite cleanly.
  - Without it → fall through to the bare-token path-shape checks, so
    genuine paths inside parens (`(./commands/spec.md)`,
    `(.claude/skills/foo.md)`) still rewrite via the slash /
    root-relative branches, while bare filenames like
    `(SPEC.md or equivalent)` stay verbatim.

  Verified end-to-end by regenerating against the
  `addyosmani-agent-skills` pack: `(SPEC.md or equivalent)` is now
  preserved in `.gemini/commands/planning.toml`,
  `.claude/commands/planning.md`, `.cursor/commands/planning.md` and the
  24 other targets. The same rule fires identically for `.md`, `.mdc`,
  and `.toml` outputs — the engine is format-agnostic; only the
  classifier's prose-vs-link distinction needed tightening.

  Tests:
  - New `tests/unit/core/link-token-classifier-prose-vs-md-link.test.ts`
    (8 cases) pins the prose-vs-link distinction.
  - `tests/unit/core/link-rebaser-deep-branches.test.ts:396` updated:
    positive cases now require `](` prefix; a new sibling case pins the
    negative behavior for prose forms.

## 0.18.1

### Patch Changes

- d7e3a19: Internal refactor of the skill-import dispatch path and watch-test determinism — no user-visible behavior change.

  **`agentsmesh import` (Cline / Windsurf / Codex CLI)**

  The per-target `readdir → readFileSafe(SKILL.md) → try recognizer → fall back to skill import` loops, which had drifted independently and kept causing the same class of bug (lessons L132), are consolidated behind one shared orchestrator: `importSkillsDirectory(sourceSkillsDirs, options, recognizers)` plus `projectedAgentRecognizer({ canonicalAgentsDir })` and `commandSkillRecognizer({ canonicalCommandsDir })` factories. Each adapter now collapses to a config object plus a recognizer list. A minor side-effect of the consolidation: Cline now performs the same stale-skill-dir cleanup on re-import that Windsurf and Codex already did, so previously orphaned `.agentsmesh/skills/am-agent-<name>/` directories from buggy earlier runs are removed when a Cline projected-agent skill is re-imported.

  **`agentsmesh watch`**

  `runWatch` now accepts an optional `onCycle({ featuresChanged })` callback fired once per completed generate cycle (initial + each debounced regen). This is a deterministic synchronization signal for tests/integrations that previously relied on scraping `'Regenerated.'` log lines. The unrelated, dead `_suppressAgentsmeshDirUntil` parameter is removed from `shouldIgnoreWatchPath`. Watch-test budget bumped from 45s → 60s base (×1.5 under coverage = 90s) to survive full-suite scheduler load on macOS FSEvents.

  **Developer tooling**

  New `pnpm flake:watch` script (`scripts/flake-check-watch.ts`) runs the watch unit suite N times under `COVERAGE=1` to validate stability whenever the watch loop or scheduler envelope changes.

  **Internal**
  - New file: `src/targets/import/shared/skill-import-pipeline.ts` gains `importSkillsDirectory`, `projectedAgentRecognizer`, `commandSkillRecognizer`, `SkillRecognizer`, `SkillRecognizerContext` exports. The dead `SkillImportOptions.sourceSkillsDir` field is removed; `sourceSkillsDirs` is now a required first argument to the orchestrator.
  - Adapter migrations: `cline/skills-adapter.ts`, `windsurf/skills-adapter.ts`, `codex-cli/skills-adapter.ts` reduced to thin wrappers. `cursor/skills-adapter.ts` and `copilot/skills-adapter.ts` shed the now-dead option field.
  - 17 new unit tests; touched-scope branch coverage at 100% (25/25).
  - `runWatch` adds `RunWatchOptions` + `WatchCycleInfo` types. The new third parameter is optional and backwards-compatible.

## 0.18.0

### Minor Changes

- 7c57018: Replace the AGENTS.md content-normalization logic with a shared-path rewrite skip. When two or more active targets emit the same root-instruction path (most commonly `AGENTS.md`), every copy keeps canonical `.agentsmesh/...` references instead of being rewritten to target-specific paths. The collision resolver then merges the byte-identical copies trivially.

  **User-visible behavior change**

  The single `AGENTS.md` at the project root now contains references like `.agentsmesh/skills/<name>/SKILL.md` rather than the previous `.agents/skills/<name>/SKILL.md` (or any other target-specific prefix). Tools reading `AGENTS.md` follow the path literally and find the file under `.agentsmesh/`, which is always present as the canonical source of truth. Each target's own directory (`.agents/skills/`, `.factory/skills/`, etc.) is still generated and its files still receive normal per-target reference rewriting — only the shared root-instruction file uses canonical paths.

  **Why**

  The previous approach generated N copies of `AGENTS.md`, rewrote their references to N different target-specific paths, and then ran ~200 lines of fragile reverse-normalization to prove they were "actually the same". That logic carried hardcoded target IDs, regex bare-path anchoring, and reverse reference maps — every new target risked breaking it. The new approach is structural: skip rewriting when a path is claimed by 2+ targets as their root instruction (detected via descriptor `rootInstructionPath` + `outputFamilies` of kind `'additional'`), so the content stays byte-identical and collision merge is a no-op. Plugin targets that declare a `rootInstructionPath` get the same treatment automatically — no per-target opt-in needed.

  **Internal**
  - Drops `src/targets/catalog/agents-md-overlap.ts` (199 lines) and its test file
  - Adds `computeSharedRootInstructionPaths()` to `engine.ts` (descriptor-driven, no hardcoded target IDs)
  - Adds an optional `skipPaths: ReadonlySet<string>` parameter to `rewriteGeneratedReferences()`
  - Drops gemini-cli's legacy pre-emptive `.agentsmesh/skills/` → `.agents/skills/` substitution in `generateRules` — no longer needed under the new approach
  - 28 new tests across `tests/unit/core/shared-root-instruction-paths.test.ts`, `reference-rewriter-shared-paths.test.ts`, and `tests/contract/shared-agents-md.test.ts`

- 7c57018: Add six new built-in targets: `deepagents-cli`, `factory-droid`, `jules`, `pi-agent`, `replit-agent`, and `rovodev`. Each ships with project and global mode support, full feature generators (rules, skills, MCP, hooks, ignore, permissions where applicable), an importer, capability-focused unit tests, and integration coverage for the import + generate round-trip. The new targets appear automatically in the support matrix, the import target table, and every auto-generated tool list — no manual doc edits required to discover them.
- 7c57018: Add a required `metadata` field to `TargetDescriptor` and a new `TARGET_REGISTRY` aggregator that drives every user-facing target listing in README and the website. Plugin and built-in targets now declare display name, category, official URL, and a one-line description in a single place; the TypeScript compiler enforces completeness.

  **New public surface**
  - `TargetMetadata` interface (`displayName`, `category: 'cli' | 'ide' | 'agent-platform'`, `officialUrl`, `shortDescription`) exported from `src/targets/catalog/target-descriptor.ts`.
  - `TARGET_REGISTRY: Readonly<Record<BuiltinTargetId, TargetEntry>>` plus `listTargets()`, `targetsByCategory()`, and `primaryImportRoot()` helpers exported from `src/targets/catalog/target-metadata-registry.ts`.
  - Every `TargetDescriptor.metadata` is required at compile time; the field is now part of the contract for plugin authors.

  **Plugin authors — what to do**

  If you ship a `TargetDescriptor` from a plugin package, add the `metadata` block immediately after `id:`:

  ```typescript
  export const descriptor = {
    id: 'my-tool',
    metadata: {
      displayName: 'My Tool',
      category: 'cli',
      officialUrl: 'https://example.com',
      shortDescription: 'One-line description used in tool lists',
    },
    // ...rest unchanged
  } satisfies TargetDescriptor;
  ```

  The TypeScript compiler will fail if any field is missing or mistyped. The metadata appears in any auto-generated tool list a consumer renders — there is no separate registration step.

  **Tooling updates**
  - `agentsmesh target scaffold <id>` now emits a `metadata` block with `TODO(agentsmesh-scaffold)` markers that fail to compile until the author fills them in.
  - The `add-agent-target` skill and `target-addition-checklist.md` reference list the metadata fields in Phase 1 research; the `add-new-target-playbook.md` walks through filling them.

### Patch Changes

- 7c57018: Auto-generate every user-facing target listing from `TARGET_REGISTRY`, and reposition install methods so AgentsMesh is no longer presented as Node-only.

  **Auto-generated target listings**

  `pnpm matrix:generate` now writes three new auto-generated marker blocks in addition to the existing project/global feature matrices:
  - `tool-list` (README + homepage) — every target grouped by category with links to the official tool URL
  - `import-targets` (`cli/import.mdx`) — all 30 targets with their primary read path
  - `tool-details` (`reference/supported-tools.mdx`) — uniform per-target sections with display name, category, official URL, project + global root paths, and skill directory

  `pnpm matrix:verify` (CI gate) fails the build whenever any of the four documents drift from the catalog. The render script was split into `scripts/support-matrix-blocks.ts` (pure builders) and a slim orchestrator.

  **Hardcoded enumerations removed**

  Replaced with links to the support matrix or generated content:
  - README import-target list (was 13/30) and tool-format examples
  - Homepage prose enumeration of 15+ tools
  - `cli/import.mdx` per-target source→canonical mapping tables (only 7/30 documented) — collapsed into a single canonical-pattern table plus editorial caveats for the 5 targets with real implementation quirks
  - `cli/init.mdx` auto-detection list (12 hardcoded paths) and starter-config example
  - `cli/generate.mdx` output-locations table (was 12/30)
  - `canonical-config/commands.mdx` + `canonical-config/hooks.mdx` per-target feature support enumerations
  - `reference/supported-tools.mdx` per-tool detail sections (was 24/30 hand-written, ~494 lines) replaced with the auto-generated `tool-details` block covering all 30 targets uniformly

  **Install repositioning**

  AgentsMesh now presents three install methods as equals — Homebrew (no Node.js required), standalone binary (no Node.js required), and npm/pnpm/yarn (Node.js 20+). The `getting-started/installation.mdx` page rewrite uses a Tabs block with a "which method should I use?" comparison table. The README install section was reordered (Homebrew first, npm last) and `npx agentsmesh ...` was stripped from every non-install code sample — `npx` survives only in the two explicit "run without installing" snippets where it's the legitimate use. CI workflow examples, guides, and command-reference pages now use the plain `agentsmesh` binary, which works after any install method (with `npx` documented as the prefix for users who chose `npm install -D`).

## 0.17.0

### Minor Changes

- e45befe: Add 6 P0-TierA targets: Aider, Amazon Q Developer, Augment Code, Crush, Qwen Code, and Trae

  New built-in targets with full project and global mode support:
  - **Aider** — `CONVENTIONS.md`, `.aider/skills/`, `.aiderignore`
  - **Amazon Q Developer** — `.amazonq/rules/*.md`, `.amazonq/mcp.json`
  - **Augment Code** — `.augment/rules/`, `.augment/commands/`, `.augment/skills/`, `.augment/settings.json`, `.augmentignore`
  - **Crush** — `CRUSH.md`, `.crush/skills/`, `crush.json` (MCP + hooks + permissions), `.crushignore`
  - **Qwen Code** — `QWEN.md`, `.qwen/rules/`, `.qwen/commands/`, `.qwen/agents/`, `.qwen/skills/`, `.qwen/settings.json`, `.qwenignore`
  - **Trae** — `.trae/rules/`, `.trae/skills/`, `.trae/mcp.json`, `.trae/.ignore`

  All targets include: descriptor, generator, importer, linter, import-map, fixtures, unit tests, global-layout tests, contract definitions, and branch coverage tests. Catalog grows from 18 to 24 builtin targets.

## 0.16.0

### Minor Changes

- 0b33c0d: Security and robustness hardening across MCP write tools, hook script generation, remote fetch, and canonical name validation. Some changes are behaviorally breaking; pre-1.0 minor bump per project policy.

  **Hardening (no contract change)**
  - MCP `add_mcp_server` / `update_mcp_server` / `update_hooks` / `update_permissions` now reject obviously malicious payloads at the schema layer (shell metacharacters in `command`, embedded newlines in matchers, env keys outside `[A-Za-z_][A-Za-z0-9_]*`, non-`http(s)` URLs, args arrays over 100, unknown server fields, permission patterns outside `Tool` / `Tool(matcher)`).
  - Generated Copilot and Cline hook wrappers strip CR/LF from event/matcher/command before embedding them in the `# agentsmesh-*:` comment header so a multi-line YAML scalar cannot break out of the comment into executable shell.
  - Generated `.sh` / `.bash` / `.zsh` files are now written with mode `0o755` so hooks emitted to disk are exec'able by the runner without a manual `chmod +x`.
  - GitHub tarball downloads are capped at 500 MiB and aborted mid-stream when the running byte total exceeds the cap (Content-Length is also pre-checked).
  - Git refs and clone URLs that begin with `-` are rejected to block `--upload-pack=…` style option injection.
  - `MCP` non-`McpError` fallbacks redact absolute filesystem paths from raw `Error.message` strings; `IO_ERROR` envelopes carry the underlying `errno` in `details`.
  - `parseAgents` / `parseCommands` / `parseRules` / `parseSkills` reject canonical filenames that are Windows reserved devices (CON, AUX, NUL, COM1–9, LPT1–9), contain `<>:|?*`, or end in `.`/space; nested basename collisions (e.g. `agents/foo.md` and `agents/sub/foo.md`) now error instead of silently last-write-wins.
  - `loadAllPlugins` now collects all per-plugin failures and rethrows as a single combined error when any entry has `strict: true` or `AGENTSMESH_STRICT_PLUGINS=1` is set in the environment. Previous warn-and-skip behavior remains the default.

  **Breaking**
  - Generated hook wrappers run under `set -eu` instead of `set -e`. A canonical `command` that references an unset shell variable (`echo $VAR` where `$VAR` is never exported) will now abort the hook. Use `${VAR:-default}` syntax when an unset value is intentional.
  - `AGENTSMESH_CACHE` must now be an absolute path that is not the filesystem root (`/` or a Windows drive root). Relative paths and roots throw at startup. Previously the value was used verbatim.
  - MCP `create_rule` / `create_command` / `create_agent` and the canonical handlers reject names containing `/`. The `NAME_RE` validator was tightened from `[a-zA-Z0-9_/-]*` to `[a-zA-Z0-9_-]*` — names must be flat identifiers.
  - Canonical files named after Windows reserved devices or with reserved characters now throw `CanonicalNameError` at parse time on every host (previously silent failure on Windows, success on POSIX).

  **Internal**
  - `src/mcp/register.ts`, `src/utils/filesystem/fs.ts`, `src/mcp/handlers/orchestrate.ts`, and `src/cli/commands/target-scaffold/templates.ts` were each split under the project's 200-line file budget. Public API surface (`./engine`, `./canonical`, `./targets`) is unchanged.
  - New `executableModeFor(path)` helper in `src/utils/filesystem/fs.ts` infers the executable bit from the path extension; `writeFileAtomic` accepts an optional `{ mode }` override.

## 0.15.0

### Minor Changes

- 1edb936: Homebrew tap and standalone-binary distribution. `brew tap samplexbro/agentsmesh && brew install agentsmesh` installs from a Homebrew formula auto-rendered against the published npm tarball; `curl -fsSL https://github.com/sampleXbro/agentsmesh/releases/latest/download/install.sh | sh` downloads a Node-free Bun-compiled binary for macOS (arm64/x64) and Linux (arm64/x64), verifies SHA256, installs to `~/.agentsmesh/bin`, and adds it to PATH for zsh, bash, and fish. The release workflow builds binaries for every supported platform on each `master` push, attaches them to a GitHub Release alongside `SHA256SUMS`, and pushes the formula to the tap repo; `workflow_dispatch` re-runs rebuild assets against an existing tag. Installer fails closed on missing/unverifiable checksums and rejects shell-unsafe `AGENTSMESH_INSTALL` paths.

## 0.14.0

### Minor Changes

- 16a7f0d: Self-serve MCP server. `agentsmesh mcp` boots a stdio MCP server exposing 41 tools and 16 resources for canonical config introspection, CRUD on rules/commands/agents/skills, settings management (config/mcp-servers/permissions/hooks/ignore), capability matrix queries, and orchestration verbs (generate/lint/check/diff/import/convert). Auto-registered in `.agentsmesh/mcp.json` on `init` and `import`. See the MCP server reference page.

## 0.13.0

### Minor Changes

- f68ab67: feat(cli): add convert command for direct tool-to-tool migration

  Adds `agentsmesh convert --from <source> --to <target>` for direct tool-to-tool conversion without going through canonical setup. Internally chains the existing import and generate pipelines via a temporary directory, producing destination tool files from source tool files in a single command. Supports `--dry-run` and `--json` flags.

- c8d58c0: feat(cli): add structured JSON output mode

  Adds `--json` support across CLI commands so automation and CI can consume stable machine-readable command results. JSON mode returns structured success/error envelopes while keeping the existing human-readable output as the default.

## 0.12.0

### Minor Changes

- 11c0d58: feat(amp): add Amp (Sourcegraph) as a new built-in target

  Amp is a coding agent by Sourcegraph (ampcode.com). This adds full project and global mode support:
  - **Rules**: `AGENTS.md` (root + embedded additional rules)
  - **Skills**: `.agents/skills/*/SKILL.md` skill bundles (shared path with Codex CLI, consumer role)
  - **MCP**: `.amp/settings.json` under `amp.mcpServers` key with settings merge
  - **Global mode**: `~/.config/amp/AGENTS.md`, `~/.config/amp/skills/`, `~/.config/amp/settings.json`
  - Commands and agents projected as skills via `supportsConversion`
  - Lint warnings for unsupported features (hooks, ignore, permissions)

- fa8e208: feat(warp): add Warp as a new built-in target

  Warp is an agentic development environment by Warp.dev. This adds project and global mode support:
  - **Rules**: `AGENTS.md` (root + embedded additional rules); legacy `WARP.md` supported on import
  - **Skills**: `.warp/skills/` with YAML frontmatter skill bundles
  - **MCP**: `.mcp.json` at project root (standard format, shared with Claude Code)
  - **Commands/Agents**: projected as skills via `supportsConversion`
  - **Global mode**: `~/.warp/skills/` (skills only — global rules are UI-managed via Warp Drive)
  - Lint warnings for unsupported features (hooks, ignore, permissions)

- bfc0a57: feat(zed): add Zed as a new built-in target

  Zed is a modern code editor with a built-in AI assistant (zed.dev). This adds project and global mode support:
  - **Rules**: `.rules` (root + embedded additional rules in a single file)
  - **MCP**: `.zed/settings.json` under `context_servers` key with settings merge
  - **Global mode**: `~/.config/zed/settings.json` (MCP only — no global rules file)
  - Lint warnings for unsupported features (hooks, ignore, permissions)

## 0.11.0

### Minor Changes

- 85b8601: feat(goose): add Goose (Block) as a new built-in target

  Goose is an open-source AI coding agent by Block (goose-docs.ai). This adds full project and global mode support:
  - **Rules**: `.goosehints` (root + embedded additional rules)
  - **Skills**: `.agents/skills/*/SKILL.md` skill bundles (shared path with Codex CLI)
  - **Ignore**: `.gooseignore` with gitignore-style patterns
  - **Global mode**: `~/.config/goose/.goosehints`, `~/.config/goose/.gooseignore`, `~/.agents/skills/`
  - Lint warnings for unsupported features (commands, hooks, MCP, permissions)

- ca7e48f: feat(opencode): add OpenCode as a new built-in target

  OpenCode (opencode.ai) is an open-source AI coding agent CLI/TUI. This adds full project and global mode support:
  - **Rules**: `AGENTS.md` (root) + `.opencode/rules/*.md` (additional)
  - **Commands**: `.opencode/commands/*.md` with description frontmatter
  - **Agents**: `.opencode/agents/*.md` with mode/description/model frontmatter
  - **Skills**: `.opencode/skills/*/SKILL.md` skill bundles
  - **MCP**: `opencode.json` with native format conversion (array `command`, `environment` key)
  - **Global mode**: `~/.config/opencode/` with full feature parity
  - Lint warnings for unsupported features (hooks, ignore, permissions)

## 0.10.0

### Minor Changes

- c4fb261: Add `kilo-code` as a new built-in target. Kilo Code is a multi-surface AI coding platform (VS Code extension, JetBrains plugin, CLI, cloud agent) and a fork of Roo Code (which is a fork of Cline).

  Generation always uses Kilo's new layout: `AGENTS.md` (root), `.kilo/rules/`, `.kilo/commands/`, `.kilo/agents/` (first-class subagents), `.kilo/skills/`, `.kilo/mcp.json`, and `.kilocodeignore`. Import covers BOTH the new layout and Kilo's legacy layout (`.kilocode/`, `.kilocodemodes`) so existing kilo / Roo-era projects round-trip cleanly.

  Capabilities (project + global):
  - `rules`, `additionalRules`, `commands`, `agents`, `skills`, `mcp`, `ignore`: native
  - `hooks`: none — Kilo Code has no user-facing lifecycle hook system; canonical hooks emit a lint warning.
  - `permissions`: none — Kilo permissions live in `kilo.jsonc`, which agentsmesh does not generate in v1; canonical permissions emit a lint warning.

  Global mode generates under `~/.kilo/` (`AGENTS.md`, `rules/`, `commands/`, `agents/`, `skills/`, `mcp.json`) plus `~/.kilocodeignore`, and mirrors skills into `~/.agents/skills/` for cross-tool compatibility (suppressed when `codex-cli` is also active).

  Use `agentsmesh import --from kilo-code` to migrate existing Kilo projects (new or legacy layout) into canonical `.agentsmesh/`, then `agentsmesh generate --targets kilo-code` to project them back as the documented new layout.

- 5d6cfbb: Sequential `agentsmesh import --from <target>` runs now merge MCP servers by name into `.agentsmesh/mcp.json` instead of replacing the whole file. Existing canonical entries are preserved and the imported set wins on name collision, so a `claude-code` import followed by a `cursor` import keeps both targets' servers in canonical state.

  Affects every importer that writes `mcp.json`: `claude-code` (`.claude/settings.json` + `.mcp.json` + `~/.claude/.mcp.json`), `codex-cli` (`config.toml`), `continue`, `cursor`, and any descriptor-driven importer using `mode: 'mcpJson'`. The previous behavior — last import overwrites the file and silently drops earlier servers — is gone.

  Also fixed: a build-time regression where `writeMcpWithMerge` was referenced by five importers without the backing module being shipped, breaking `tsc --noEmit` for consumers building from source.

## 0.9.0

### Minor Changes

- b3f702d: Adds three new `agentsmesh lint` diagnostics, a recommended `.gitignore` policy for materialized packs, and a one-step `agentsmesh target-scaffold` workflow.

  Added:
  - New lint diagnostics, all emitted as warnings (do not change `lint`'s exit code):
    - `silent-drop-guard` flags canonical content a target would otherwise drop without trace based on its capability map.
    - `hook-script-references` warns when a hook command references a script path for any target whose generator does not copy hook scripts into its output. **All built-in targets except Copilot fall under this rule today.** Existing hook configs that reference local script paths (e.g. `./scripts/pre-commit.sh`) will surface a new warning per matching target on the first lint after upgrade. The script must already exist relative to the hook execution directory or the generated config will fail at runtime — the diagnostic just makes the gap visible.
    - `rule-scope-inversion` catches manual-activation rules whose scope contradicts the target's projection rules.
      All three are wired into `runLint` for every target via descriptor capabilities; no existing rule has been removed and no diagnostic is upgraded to error severity.
  - `agentsmesh init` now writes `.agentsmesh/packs/` into `.gitignore` alongside `agentsmesh.local.yaml`, `.agentsmeshcache`, and `.agentsmesh/.lock.tmp`, and skips entries already covered by a broader pre-existing pattern (e.g. an existing `.agentsmesh/` line covers `.agentsmesh/packs/`). Materialized packs are treated like `node_modules` — `installs.yaml` is committed and `agentsmesh install --sync` reproduces the tree deterministically post-clone.
  - `agentsmesh target-scaffold` post-steps collapse the previous three-edit sequence into one `pnpm catalog:generate` invocation, backed by a new auto-discovered builtin-target catalog (`scripts/generate-target-catalog.ts` + `pnpm catalog:verify` drift guard in CI).

  Changed:
  - The `agentsmesh.json` and `pack.json` schemas now list `targets` enums alphabetically. Schema consumers that pin order will see a one-time diff; values are unchanged.
  - README documents the commit-vs-gitignore convention for generated tool folders and clarifies native Windows support (no WSL).

  Internal:
  - Per-target importers (`antigravity`, `claude-code`, `continue`, `copilot`, `cursor`, `gemini-cli`, `junie`, `kiro`, `roo-code`) migrated to the descriptor-driven import runner with mapper functions extracted into `import-mappers.ts` to keep `index.ts` ↔ `importer.ts` cycles out of the TDZ.
  - New shared link-format registry (`src/core/reference/link-format-registry.ts`) consolidates per-target link rendering rules.
  - `writeFileAtomic` now refuses to follow a pre-existing symlink at the target path (closes a TOCTOU window where a swapped symlink could redirect writes outside the project tree).
  - `agentsmesh plugin add` now warns that plugins load as trusted Node.js modules with full process privileges.

### Patch Changes

- 08ef1b0: Security hardening and correctness fixes across install, generate, reference rewriting, plugin loading, and caching subsystems.

  Fixed:
  - `agentsmesh install --path` now rejects paths that traverse outside the install source root, closing a directory-escape vulnerability where `--path ../../outside` could read files outside the fetched source.
  - Pack names are validated as single directory segments before materialization — values containing path separators (e.g. `../../escape`) are rejected, preventing writes outside `.agentsmesh/packs/`.
  - `writeFileAtomic` now checks the `.tmp` staging path for symlinks before writing, closing a TOCTOU window where a symlink at `${path}.tmp` could redirect writes to an attacker-controlled location.
  - `agentsmesh generate --targets` now validates filter values against configured targets and errors on unknown names. Previously a misspelled target silently produced zero outputs and `--check` reported success, allowing CI to pass while checking nothing.
  - Project-scope skill mirrors now receive source-map entries for reference rewriting. Previously only global-scope mirrors were mapped, leaving Markdown links inside project-mirrored skill files unrewritten.
  - Plugin targets declaring `sharedArtifacts` are now recognized during global reference rewriting. Previously only builtin target descriptors were consulted, so plugin-owned shared paths could be rebased through the wrong artifact map.
  - `runDescriptorImport` is now exported from `agentsmesh/targets` as documented in the plugin guide.
  - Importer fallback sources are now tried when configured primary files are absent on disk, not only when the primary source list is empty.
  - `flatFile` and `mcpJson` import modes now honor `canonicalDir` when `canonicalFilename` is a bare filename, matching the documented directory-plus-filename contract for plugin descriptor authors.
  - Rule path mapping uses POSIX `basename` with backslash normalization instead of host `node:path`, preventing broken slugs when Windows-shaped canonical paths appear on a POSIX host.
  - Relative `file:` plugin sources now resolve against `projectRoot` instead of the filesystem root.
  - Remote cache keys now preserve dots and use double-separator delimiters so distinct refs like `v1.0.0` and `v1_0_0` no longer collide. Existing cached entries will be re-fetched once after upgrade.

## 0.8.0

### Minor Changes

- b3f702d: Adds three new `agentsmesh lint` diagnostics, a recommended `.gitignore` policy for materialized packs, and a one-step `agentsmesh target-scaffold` workflow.

  Added:
  - New lint diagnostics: `silent-drop-guard` flags canonical content a target would otherwise drop without trace, `hook-script-references` reports hook commands pointing at missing wrapper scripts, and `rule-scope-inversion` catches manual-activation rules whose scope contradicts the target's projection rules. They are wired into `runLint` for every target via descriptor capabilities, so existing configs may surface new warnings; no rule has been removed.
  - `agentsmesh init` now writes `.agentsmesh/packs/` into `.gitignore` alongside `agentsmesh.local.yaml`, `.agentsmeshcache`, and `.agentsmesh/.lock.tmp`. Materialized packs are treated like `node_modules` — `installs.yaml` is committed and `agentsmesh install --sync` reproduces the tree deterministically post-clone.
  - `agentsmesh target-scaffold` post-steps collapse the previous three-edit sequence into one `pnpm catalog:generate` invocation, backed by a new auto-discovered builtin-target catalog (`scripts/generate-target-catalog.ts` + `pnpm catalog:verify` drift guard in CI).

  Changed:
  - The `agentsmesh.json` and `pack.json` schemas now list `targets` enums alphabetically. Schema consumers that pin order will see a one-time diff; values are unchanged.
  - README documents the commit-vs-gitignore convention for generated tool folders and clarifies native Windows support (no WSL).

  Internal:
  - Per-target importers (`antigravity`, `claude-code`, `continue`, `copilot`, `cursor`, `gemini-cli`, `junie`, `kiro`, `roo-code`) migrated to the descriptor-driven import runner with mapper functions extracted into `import-mappers.ts` to keep `index.ts` ↔ `importer.ts` cycles out of the TDZ.
  - New shared link-format registry (`src/core/reference/link-format-registry.ts`) consolidates per-target link rendering rules.

## 0.7.0

### Minor Changes

- 5179de0: Native Windows support is now first-class. `windows-latest` × Node 22 joins `ubuntu-latest` × Node 20/22/24 and `macos-latest` × Node 22 in the CI quality matrix, the `os: ["darwin", "linux"]` restriction is removed from `package.json`, and the README/website call out Linux, macOS, and Windows as equally supported platforms.

  The install/pack persistence layer is now separator-agnostic: `installs.yaml` `source`/`path`/`paths` and `pack.yaml` local-source fields are always serialized as POSIX through the new `src/install/core/portable-paths.ts` helper, regardless of the host separator. `agentsmesh install <local-path>` parses Windows paths (including cross-drive sources and `.agentsmesh/` segments split by backslashes) into portable manifest entries, and legacy manifests written on Windows are normalized on read so existing repos converge without migration. `agentsmesh import --from windsurf` and `--from codex-cli` now detect nested `AGENTS.md` / `AGENTS.override.md` via `basename(srcPath)`; the previous `srcPath.endsWith('/AGENTS.md')` check silently skipped nested rules on Windows because `readDirRecursive` returns native separators. `scripts/flake-check.ts` resolves `pnpm.cmd` on `win32`, and `tests/helpers/node-bin.ts` is the single source for `node_modules/.bin/<name>` shim resolution across platforms.

  A new Windows path-safety contract (`src/utils/filesystem/windows-path-safety.ts` plus `tests/contract/windows-path-safety.matrix.test.ts`) asserts that every generated artifact path emitted by every builtin target — in both project and global scope — survives a Windows clone/checkout/write cycle. Reserved device names (case-insensitive `CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9`), reserved characters (`<>:"|?*` plus ASCII control chars), trailing dots/spaces, and case-only collisions on default NTFS / APFS volumes are now regression-locked across 48 contract assertions.

  `agentsmesh lint` warns when `hooks.yaml` is non-empty for `cline` or `copilot`, because both targets emit `.sh` wrapper scripts (`.clinerules/hooks/*.sh`, `.github/hooks/scripts/*.sh`) with `#!/usr/bin/env bash` headers that need a POSIX shell (git-bash or WSL) to execute on Windows. Other targets (claude-code, cursor, windsurf, kiro, gemini-cli) embed the user's `command` string directly into JSON config and stay fully portable. The Windows portability story for hooks is documented in `website/src/content/docs/canonical-config/hooks.mdx`.

  Also fixed: `tests/integration/lint.integration.test.ts` stops hardcoding `shell: '/bin/sh'` plus `2>&1` for stderr capture (which ENOENTed on Windows runners) — it now spawns `process.execPath` via `spawnSync` and concatenates the captured streams.

  Fixed a long-latent race in `acquireProcessLock` (`src/utils/filesystem/process-lock.ts`) that surfaced the test failure `ENOENT: rename .agentsmesh/.lock.tmp -> .agentsmesh/.lock` under parallel `agentsmesh generate` invocations. Between `mkdir(lockPath)` succeeding and `writeFile(holder.json)` completing, a competing acquirer would treat the metadata-less lock dir as orphaned, evict it, and silently steal the mutex — letting both processes into the critical section and racing their `writeFileAtomic` writes. The lock now treats lock dirs younger than a 2-second grace window as held even when `holder.json` is missing, and only evicts genuinely orphaned older directories. Covered by `tests/integration/generate-process-lock.integration.test.ts` plus a new unit test in `tests/unit/utils/process-lock.test.ts`.

  Fixed a generator-side Windows path bug surfaced by the Windows CI matrix: rule slug extraction in `src/targets/{claude-code,codex-cli,copilot,cursor,continue,catalog}/...` used `rule.source.split('/').pop()!.replace(/\.md$/, '')`, which on Windows where `rule.source` uses `\` separators returned the _entire absolute path_ and produced `.cursor\rules\C:\Users\...\.agentsmesh\rules` ENOENT crashes during `writeFileAtomic`. All 10 occurrences across 8 files now use `basename(rule.source, '.md')` from `node:path`, which is platform-aware. Watch mode in `src/cli/commands/watch.ts` now sets `usePolling: process.platform === 'win32'` because Windows native `ReadDirectoryChangesW` misses events for files newly created in just-watched subdirectories under the GitHub Actions `AppData\Local\Temp` short-name path.

  Fixed a second Windows path bug in the reference rewriter: `buildArtifactPathMap`, `addPackSkillArtifactMappings`, `applyCopilotInstructionArtifactRefs`, `collectPlannedPaths`, and the validator in `src/core/reference/validate-generated-markdown-links.ts` were using native `node:path.join`/`normalize` directly. The rebaser itself uses `pathApi(projectRoot)` which picks `win32` or `posix` based on the _path format_, not the host platform. Synthetic POSIX project roots (used in unit tests) and real Windows project roots could produce mismatched keys vs. lookups, so the rewriter silently no-op'd. All five sites now share one `pathApi(projectRoot)` so map keys and lookups always agree.

## 0.6.0 - 2026-04-25

### Added

- **Full plugin parity with built-in targets** — plugin targets now have access to the same runtime capabilities as built-in targets:
  - **Conversion support**: plugins can declare `supportsConversion: { commands: true, agents: true }` and users can configure `commands_to_skills` / `agents_to_skills` for plugin target IDs in `agentsmesh.yaml`. The conversion schema now accepts arbitrary target IDs alongside hardcoded builtins. Conversion values support per-scope control: `foo-ide: { project: true, global: false }` or the shorthand `foo-ide: true` for both scopes.
  - **Global mode**: plugin descriptors that define `global` or `globalSupport` layouts, `globalCapabilities`, and `globalDetectionPaths` are fully resolved by the engine — `generate --global`, `import --global`, `lint --global`, and `matrix --global` all work with plugin targets.
  - **Scoped settings emission**: `emitScopedSettings` hooks on plugin descriptors are now called during generation (previously only checked on builtins).
  - **Hook post-processing**: `postProcessHookOutputs` hooks on plugin descriptors are now called during the hook generation pass.
  - **Per-feature lint hooks**: `lint.commands`, `lint.mcp`, `lint.permissions`, `lint.hooks`, and `lint.ignore` on plugin descriptors receive `{ scope }` context for project vs global differentiation.
  - **Unified generator resolution**: a single code path (`resolveTargetFeatureGenerator`) resolves generators for both builtins and plugins, removing duplicate resolution logic from the engine.
- **Plugin support in all CLI commands** — `diff`, `check`, `matrix`, and `import --from <plugin-id>` now bootstrap and resolve plugin targets. Previously only `generate` and `lint` supported plugins.
- **Richer target scaffold** — `agentsmesh target scaffold` now generates descriptors with global layout, `globalCapabilities`, `globalDetectionPaths`, `supportsConversion`, per-feature lint hook stubs, and `rewriteGeneratedPath` for global path rewriting.
- **Comprehensive plugin test fixture** (`tests/fixtures/plugins/rich-plugin/`) — covers 100% of `TargetDescriptor` fields including all 8 feature generators, per-feature lint hooks, project and global layouts with output families, shared artifacts, scope extras, scoped settings, hook post-processing, and conversion support.
- **Typed root barrel export** — `import { generate, importFrom, loadCanonical, registerTargetDescriptor } from 'agentsmesh'` now resolves to a proper `.d.ts` under strict TypeScript. The root `exports."."` is a conditional block with `types`, `import`, and `default`, pointing at a new public barrel (`src/public/index.ts`). Closes `TS7016: Could not find a declaration file for module 'agentsmesh'` that appeared for any downstream TS consumer.
- **Typed error taxonomy exported from the public API** — `AgentsMeshError` base class plus 8 concrete subclasses (`ConfigNotFoundError`, `ConfigValidationError`, `TargetNotFoundError`, `ImportError`, `GenerationError`, `RemoteFetchError`, `LockAcquisitionError`, `FileSystemError`), each carrying a stable `code` field (`AM_CONFIG_NOT_FOUND`, `AM_CONFIG_INVALID`, `AM_TARGET_NOT_FOUND`, `AM_IMPORT_FAILED`, `AM_GENERATION_FAILED`, `AM_REMOTE_FETCH_FAILED`, `AM_LOCK_ACQUISITION_FAILED`, `AM_FILESYSTEM`). Programmatic consumers can branch on `err instanceof ConfigNotFoundError` or `err.code === 'AM_CONFIG_INVALID'` without parsing error message strings. Error throw sites in `src/config/core/loader.ts` and `src/utils/filesystem/fs.ts` now emit typed errors; stack-trace context and `cause` chains preserved.
- **Canonical domain types in the public barrel** — 14 types (`CanonicalFiles`, `CanonicalRule`, `CanonicalCommand`, `CanonicalAgent`, `CanonicalSkill`, `SkillSupportingFile`, `Permissions`, `IgnorePatterns`, `McpServer`, `StdioMcpServer`, `UrlMcpServer`, `McpConfig`, `Hooks`, `HookEntry`) are now exported from `agentsmesh` and `agentsmesh/canonical`. Programmatic consumers can finally type the result of `loadCanonical()` without reaching into internal modules.
- **Process-level lock for concurrent `generate`** — `agentsmesh generate` acquires an atomic mkdir-based lock at `.agentsmesh/.generate.lock` before writing. Concurrent generates serialize cleanly; stale locks (dead PID on the same host, or age > 60 seconds) are evicted automatically; `SIGINT`/`SIGTERM`/normal exit release the lock idempotently. Dry-run and check-only modes skip the lock. Watch mode's lock-file ignore list was extended so self-triggered generate passes do not retrigger the watcher.
- **Cross-platform CI matrix** — quality gates now run on `ubuntu-latest` × Node 20/22/24, plus `windows-latest` × Node 22 and `macos-latest` × Node 22. Previously only `ubuntu-latest` × Node 22. E2E tests run on Linux and macOS; Windows runs lint/typecheck/unit/build.
- **Packaging guards in CI** — three new gates run on every push in a dedicated `smoke` job:
  - `publint` — package.json metadata sanity (exports ordering, `files`, module type).
  - `@arethetypeswrong/cli` with the `esm-only` profile — verifies every public entrypoint resolves to types under `node16 (from ESM)` and `bundler` module resolution.
  - `tests/consumer-smoke/` — packs the tarball, installs it into a throwaway strict-mode TS project, and runs `tsc --noEmit` against every public symbol (runtime functions, canonical types, target-descriptor types, and error classes). Catches `TS7016` and type-resolution regressions that packaging-metadata checks miss.
  - Also runnable locally via `pnpm publint`, `pnpm attw`, `pnpm consumer-smoke`.
- **Post-pack smoke test in CI** — the `smoke` job installs the packed tarball with `npm install -g` and verifies `agentsmesh --version`, `agentsmesh --help`, `amsh --version`, and `agentsmesh init --yes` all succeed in a clean temp project. Catches broken shebangs, missing files from the `files` array, and bin misconfiguration before publish.
- **`docs/add-new-target-playbook.md`** — self-contained guide for adding a new target (built-in or external plugin, project and global mode) designed to be handed to an AI coding agent. Covers research checklist, scaffold workflow, descriptor filling, realistic fixtures, strict-assertion test patterns, registration file wiring, matrix/docs updates, and a verification one-liner. Referenced by the canonical `add-agent-target` skill as the authoritative workflow document.
- **Boot-time guard against ambiguous shared-artifact ownership** — `BUILTIN_TARGETS` initialization now runs `assertSharedArtifactOwnersUnique()` (`src/targets/catalog/shared-artifact-owner.ts`) and throws if two descriptors claim the same or overlapping `sharedArtifacts: { '<prefix>': 'owner' }` entry. Previously the rewriter would silently pick the first match by iteration order, so a misconfigured plugin or future builtin could quietly route global skill writes to the wrong target. The error names both target IDs and both prefixes and suggests changing one role to `'consumer'` or namespacing the prefix. Covered by `tests/unit/targets/catalog/shared-artifact-owner.test.ts` (9 cases including identical-prefix conflicts, prefix-overlap conflicts, owner-vs-consumer non-conflicts, and the live builtin set).
- **Cross-process race coverage for the generate lock** — `tests/integration/generate-process-lock.integration.test.ts` now proves two parallel `node dist/cli.js generate` invocations against the same project serialize via the existing process lock, both exit `0`, produce deterministic output, and release `.agentsmesh/.generate.lock` after the run. Complements the existing unit tests that exercise `acquireProcessLock` directly.
- **End-to-end Copilot dual-mirror coverage** — `tests/unit/targets/copilot/global-layout.test.ts` adds two engine-level assertions that prove Copilot's `mirrorGlobalPath` emits the exact set `.copilot/skills/<name>/`, `.agents/skills/<name>/`, and `.claude/skills/<name>/` in global mode when codex-cli is not active, and skips the `.agents/skills/` mirror when codex-cli is generated alongside (so codex-cli's `'owner'` claim wins).
- **Programmatic API: complete `lint`, `diff`, `check`, and config-loader surface** — every CLI capability is now callable as a typed function. New exports from `agentsmesh` and `agentsmesh/engine`:
  - `loadConfig(projectRoot)` and `loadConfigFromDirectory(configDir)` — load + validate `agentsmesh.yaml` (merging `agentsmesh.local.yaml`) and return `{ config: ValidatedConfig, configDir }`. Throws `ConfigNotFoundError` / `ConfigValidationError` with stable `code` fields.
  - `loadProjectContext(projectRoot, options?)` — loads the same execution context the CLI uses: scoped config, plugin descriptors, `extends`, packs, and local canonical content. The returned object is directly usable with `generate`, `lint`, and `diff`.
  - `lint(opts)` — runs target linters, returns `{ diagnostics, hasErrors }`. Pure: no I/O, no logging.
  - `diff(ctx)` — runs generate internally, returns `{ results, diffs, summary }`. Plus `computeDiff(results)` and `formatDiffSummary(summary)` helpers for callers that already have generate results.
  - `check(opts)` — pure lock-vs-current drift detection backed by the new shared `src/core/check/lock-sync.ts` module. Returns a structured `LockSyncReport` (`inSync`, `hasLock`, `modified`, `added`, `removed`, `extendsModified`, `lockedViolations`). The `agentsmesh check` CLI command was refactored to use the same helper so CLI and Programmatic API can never drift.
  - New types: `ValidatedConfig`, `TargetLayoutScope`, `LintOptions`, `LintResult`, `LintDiagnostic`, `ComputeDiffResult`, `DiffEntry`, `DiffSummary`, `CheckLockSyncOptions`, `LockSyncReport`.
- **Programmatic API runtime coverage** — new `tests/integration/programmatic-api.integration.test.ts` (26 strict assertions) exercises every public function and every error class against real fixture state: shape inventory, `loadConfig` happy/missing/invalid-schema paths, `loadCanonical`, `loadProjectContext` CLI-parity loading, `generate` with exact-paths assertion, `targetFilter` narrowing, `registerTargetDescriptor` plugin wiring through `generate`, plugin `importFrom` end-to-end, `lint` shape, `diff` + `computeDiff` summary parity, `check` for `hasLock=false` / `inSync=true` / modified-drift, immutable catalog inspection, `resolveOutputCollisions`. Replaces the previous shallow `public-export-smoke.integration.test.ts` (which only checked `typeof === 'function'` and used loose `length > 0` assertions).
- **Programmatic API type contract coverage** — `tests/consumer-smoke/src/smoke.ts` extended to import every new symbol (`loadProjectContext`, `loadConfig`, `loadConfigFromDirectory`, `loadCanonical`, `loadCanonicalFiles`, `lint`, `diff`, `check`, `computeDiff`, `formatDiffSummary`, `ProjectContext`, `LoadProjectContextOptions`, `LoadCanonicalOptions`, `ValidatedConfig`, `LintOptions`, `LintResult`, `CheckLockSyncOptions`, `LockSyncReport`, `ComputeDiffResult`, `DiffEntry`, `DiffSummary`) and exercise them with no `unknown` casts (the previous `as unknown as ValidatedConfig` hack is gone now that the type is public). `pnpm consumer-smoke` packs the tarball, installs into a strict-mode TS project, and `tsc --noEmit`s the full surface — catches `TS7016` and signature regressions before publish.
- **Dedicated Programmatic API reference page** at `website/src/content/docs/reference/programmatic-api.mdx` — entrypoint table, the recommended `loadProjectContext` generate pattern, per-function signatures and examples for `loadProjectContext` / `loadConfig` / `loadCanonical` / `generate` / `importFrom` / `lint` / `diff` / `check` / `registerTargetDescriptor` / catalog inspection, full error taxonomy table, canonical types, target-descriptor types, and stability guarantees. Linked from the landing page and sidebar Reference section. README "Programmatic API" section rewritten so the example actually compiles and matches CLI setup for plugins, `extends`, and packs.

### Changed

- **Production-grade build output** — `tsup.config.ts` reworked with a split policy that matches the two artifact families:
  - **CLI binary (`dist/cli.js`)**: minified with `keepNames: true` so stack traces still reference real function/class names. Sourcemap no longer shipped to npm — with `keepNames` the minified stack traces remain debuggable from error text alone, and the 1.6 MB sourcemap was dead weight for the 99% of users who never debug into CLI internals (maintainers reproduce locally with sourcemap on).
  - **Library entries (`dist/{index,engine,canonical,targets}.js`)**: unminified (consumers' bundlers minify their own output — standard convention used by React, Vue, Vitest, tsup itself), sourcemaps shipped (consumers stepping into library code from their own debugger get a usable experience).
  - Explicit `treeshake: true` on both bundle families.
  - Net effect: `dist/cli.js` 643 KB → 325 KB (-49%); compressed npm tarball 1.21 MB → 923 KB (-24%); unpacked install 6.0 MB → 4.75 MB (-21%). CLI cold-start parse time drops correspondingly.
- **Conversion config schema**: inner `commands_to_skills` and `agents_to_skills` objects changed from `.strict()` to `.passthrough()`, allowing plugin target IDs without validation errors. The outer `conversions` object remains strict. Conversion values now accept either `boolean` (both scopes) or `{ project?: boolean, global?: boolean }` for per-scope control.
- **Conversion helpers**: `shouldConvertCommandsToSkills` and `shouldConvertAgentsToSkills` accept optional `defaultEnabled` and `scope` parameters. Per-scope config values are resolved against the active scope, with missing scope keys falling back to builtin defaults.
- **Builtin-targets module**: five lookup functions (`getTargetCapabilities`, `getTargetDetectionPaths`, `getTargetLayout`, `getEffectiveTargetSupportLevel`, `resolveTargetFeatureGenerator`) now fall back to the plugin registry via `getDescriptor()` when no builtin match is found.
- **Registry**: `builtinDescriptors` map is now lazily initialized to avoid circular-dependency crashes between `builtin-targets.ts` and `registry.ts`.
- **JSON Schema**: `schemas/agentsmesh.json` updated — conversion inner objects now use `"additionalProperties": {}` (passthrough) instead of `"additionalProperties": false`.
- **`agentsmesh generate --global` log output** — generated file paths now display with a `~/` prefix (e.g. `✓ updated ~/.claude/settings.json`) so users cannot mistake a home-directory write for a project-local write. Applies to dry-run, check-only, and success output. Project-mode display is unchanged.
- **`writeFileAtomic` safety hardening** — orphaned `.tmp` sidecars are now removed on rename failure. Target paths that already exist as directories throw `FileSystemError` with `errnoCode: 'EISDIR'` instead of leaking the raw rename error. Readable error messages preserved with original errors as `cause`.
- **Remote tar extraction hardening** — `tar.extract` for GitHub tarballs now runs with `strict: true` (promotes warnings to errors) and explicitly rejects `Link` and `SymbolicLink` entries in addition to the existing zip-slip `..` / absolute-path filter. Defense-in-depth against malicious remote packs.
- **Package metadata**: `main` and `types` point at `./dist/index.{js,d.ts}`; root `exports."."` is a full conditional block. `@arethetypeswrong/cli` and `publint` added as devDependencies. New npm scripts: `publint`, `attw`, `consumer-smoke`.
- **README**: new **Programmatic API** section with typed import examples for the root barrel and the three subpath entrypoints (`agentsmesh/engine`, `agentsmesh/canonical`, `agentsmesh/targets`).
- **`--global` commands now throw a scope-aware error when `~/.agentsmesh/agentsmesh.yaml` is missing.** The message points at the exact missing path and suggests `agentsmesh init --global` to create the global canonical root, or dropping `--global` to operate on the current project. Applies uniformly to `generate`, `import`, `lint`, `check`, `diff`, `watch`, and `matrix`. Previously a generic "config not found" error left first-time global users guessing. Covered by `tests/unit/config/scope.test.ts`.
- **`ConfigNotFoundError` constructor accepts an optional `message` override** (`{ cause?, message? }`) so wrappers can supply scope-aware copy without losing the typed error class, `code`, or `path`. Existing callers that pass only `path` (and optional `cause`) are unchanged.

### Removed

- **Native Windows support deferred to a later release.** `package.json` now declares `"os": ["darwin", "linux"]`, the CI matrix dropped `windows-latest`, and the README's Install section calls this out with WSL2 as a workaround. The deferral path and re-enablement checklist are tracked in `docs/roadmap.md` under "Windows support (deferred)". Three POSIX-correctness fixes that landed in this release as defense-in-depth — `installs.yaml` `source` field always written as POSIX (`src/install/source/parse-install-local.ts`), plugin file-URL conversion via `fileURLToPath` instead of `URL.pathname` (`src/plugins/load-plugin.ts`), and `path.join` used in the canonical extend-load test expectations — already pave the way for the eventual re-enablement.

### Fixed

- **Programmatic API parity gaps** — `loadCanonical()` now mirrors CLI canonical loading by merging `extends` and packs when config is available (`loadCanonicalFiles()` remains the local-only helper); public `importFrom()` now resolves registered plugin descriptors as well as built-ins; plugin `buildImportPaths()` hooks now participate in shared import reference normalization; `getTargetCatalog()` returns immutable catalog snapshots instead of the live built-in array; descriptor registration now rejects non-`none` capabilities that do not have a generator or settings sidecar emitter.
- **`TS7016` on root import** — `import { ... } from 'agentsmesh'` previously resolved to `./dist/cli.js`, which was built with `dts: false`. Root exports now point at the typed library barrel, and `attw` + `publint` + consumer-smoke guards prevent regression.
- **Stale coverage exclusion paths in `vitest.config.ts`** — 15 excluded files referenced stale paths after a folder restructure (`src/utils/fs.ts` → `src/utils/filesystem/fs.ts`, `src/config/lock.ts` → `src/config/core/lock.ts`, `src/install/git-pin.ts` → `src/install/source/git-pin.ts`, and others). Paths corrected; one entry for a deleted file (`src/install/local-source.ts`) removed.
- **Canonical `add-agent-target` skill** — restored mangled prose references (`` `../../` `` back to `` `.agentsmesh/` ``); updated stale code touchpoints (`src/config/schema.ts` → `src/config/core/schema.ts`, `src/cli/help.ts` → `src/cli/help-data.ts`, `src/core/matrix/matrix.ts` → `src/core/matrix/data.ts`); added missing registration-file pointers (`target-ids.ts`, `builtin-targets.ts`, `import-maps/index.ts`); named the `agentsmesh target scaffold <id>` scaffold command as the starting step; referenced `docs/add-new-target-playbook.md` for the step-by-step workflow; added `pnpm matrix:verify`, `pnpm publint`, `pnpm attw`, and `pnpm consumer-smoke` to the required verification list.

## 0.5.0 - 2026-04-23

### Added

- **JSON Schema for all config files** — `agentsmesh.yaml`, `agentsmesh.local.yaml`, `.agentsmesh/permissions.yaml`, `.agentsmesh/hooks.yaml`, `.agentsmesh/mcp.json`, and `.agentsmesh/packs/*/pack.yaml` now ship with JSON Schemas derived directly from Zod source schemas. Enables full IDE autocomplete, enum validation, and hover docs in VS Code, JetBrains, and any YAML/JSON Language Server with zero user configuration. Schemas are published to `schemas/` in the npm package and accessible at `https://unpkg.com/agentsmesh/schemas/*.json`. Run `pnpm schemas:generate` to regenerate after schema changes.
- **`$schema` comment in generated config files** — `agentsmesh init` now writes a `# yaml-language-server: $schema=...` comment as the first line of both `agentsmesh.yaml` and `agentsmesh.local.yaml`, activating IDE validation without any manual setup.
- **Global mode** (`--global`, canonical `~/.agentsmesh/`) for **all** built-in targets — Claude Code, Cursor, Copilot, Continue, Junie, Kiro, Gemini CLI, Cline, Codex CLI, Windsurf, Antigravity, and Roo Code. Each target has a `descriptor.global` layout with project→user path rewriting, import/generate alignment, optional `~/.agents/skills/` mirroring when Codex CLI is not a global target, reference/link rewriting, and comprehensive test coverage.
- **Roo Code agents → custom modes**: canonical agents now generate `.roomodes` (project) and `settings/custom_modes.yaml` (global) with a `customModes` YAML structure. Roo Code agents capability upgraded from `—` to `partial`.
- **Copilot global extras**: `~/.copilot/AGENTS.md` is now generated in global mode as a root-instructions compat file.
- **Continue global config**: global mode generates `~/.continue/config.yaml` (aggregating rules as `rules:`, commands as `prompts:`, MCP as `mcpServers:`) and `~/.continue/AGENTS.md`.
- **Copilot global skill mirror**: skills are now mirrored to both `~/.agents/skills/` and `~/.claude/skills/` in global mode.
- **Cline global hooks round-trip**: `agentsmesh import --from cline` now reads hook scripts from `~/Documents/Cline/Hooks/` (global mode) and `.clinerules/hooks/` (project mode). Hook scripts embed a `# agentsmesh-event: <event>` metadata comment for lossless round-trip; the generator also includes this comment going forward.
- `sharedArtifacts` field added to target descriptor — enables collision-free generation when multiple targets share an output path (e.g. `.agents/skills/`).
- Lint hooks wired to all target descriptors.
- Contributor skill **`add-global-mode-target`** for scoped work when extending or validating one target’s global-mode behavior.
- Comprehensive structure validation test coverage for all 12 targets in both project and global modes.
- Shared validation helpers library (`tests/unit/targets/validation-helpers.ts`) with reusable helpers for JSON, Markdown, YAML, frontmatter, and file structure validation.

### Fixed

- **Claude Code output-styles**: generated output-style files no longer carry `agent-` / `command-` filename prefixes — now `{name}.md` as documented.
- **Windsurf**: `src/AGENTS.md` removed from `managedOutputs` (was incorrectly tracked as a managed file).
- **Cline**: `.clinerules/` directory added to `managedOutputs.dirs` for correct stale-artifact cleanup after `generate`.
- **Copilot global instructions**: path-specific instructions now aggregate into `~/.copilot/copilot-instructions.md` in global mode (previously suppressed).
- **Windsurf MCP capability**: both project and global scopes now consistently `partial` (global was incorrectly `native`).
- **Codex CLI detection**: detection paths expanded to include `AGENTS.md`, `AGENTS.override.md`, `.codex/config.toml`, `.codex/agents`, and `.codex/rules`.
- **Link rebaser**: `.agentsmesh/` anchor preserved correctly in generated prose.

### Changed

- **Init scaffold:** example files created by `agentsmesh init` are now prefixed with `_` (`_example.md`, `skills/_example/SKILL.md`). Files and directories with a `_` prefix are excluded from generation, so the starter templates serve as visible reference only and do not produce tool-specific output. `_root.md` remains the sole `_`-prefixed file that is always included in generation.
- **Documentation:** README and website updated to reflect Roo Code agents support, Copilot and Continue global extras, and the new `schemas/` package contents. `generate.mdx` documents global mode path resolution (how `--global` maps to `homedir()` as `projectRoot`).

### Refactored

- Extracted `mirrorSkillsToAgents()` shared helper (`src/targets/catalog/skill-mirror.ts`) — replaces repeated `!activeTargets.includes(‘codex-cli’)` guards inline across 8 target files.
- Consolidated import map builders; removed duplicate validation tests.
- Extracted shared skill-import pipeline; deleted obsolete `skills-helpers` files.
- Improved link rebaser resolution and managed embedding.
- Removed unused `COPILOT_GLOBAL_MCP` / `COPILOT_GLOBAL_CONFIG` constants.

## 0.3.1 - 2026-04-12

### Changed

- Refresh direct and transitive dependencies to patched releases, including guarded `pnpm` overrides for vulnerable `vite`, `picomatch`, and `brace-expansion` ranges pulled in through the toolchain.

### Fixed

- Remove the brittle `npm install -g npm@latest` step from the npm trusted-publishing workflow and run the publish job on Node 24 so release automation uses a bundled npm that already satisfies trusted-publishing requirements.
- Harden `watch` command unit-test wait budgets after the Vitest upgrade so the full suite stays stable under slower CI and coverage runs.

## 0.3.0 - 2026-04-12

### Added

- Add **Kiro** as a supported target with native project-level `AGENTS.md`, `.kiro/steering/*.md`, `.kiro/skills/*/SKILL.md`, `.kiro/hooks/*.kiro.hook`, `.kiro/settings/mcp.json`, and `.kiroignore` import/generate support.

### Changed

- Replace the appended **AgentsMesh Generation Contract** root paragraph with an installed-repo guide: `agentsmesh.yaml` / `agentsmesh.local.yaml`, what lives under `.agentsmesh`, `init` / `import` / `install` / `generate`, and maintenance commands (`diff`, `lint`, `check`, `watch`, `matrix`, `merge`). Prior shipped contract wordings remain import-compatible legacy forms so root instruction upgrades do not duplicate sections.
- `agentsmesh init --yes` now adds the same example canonical files as a normal `init`, but only for categories left empty by import. The starter target set also stays conflict-free by default, leaving `codex-cli` opt-in when projects want Codex output alongside other `AGENTS.md` targets.

### Fixed

- Fix website deployment SEO handling by deriving canonical URLs, sitemap/robots output, and optional `CNAME` generation from one deploy URL source of truth. Internal docs links now stay base-agnostic across GitHub Pages project paths and root custom domains.
- When multiple targets generate `AGENTS.md`, AgentsMesh now prefers the richer Codex output when it is a strict superset instead of failing the whole generate pass on the `codex-cli`/Kiro overlap.

## 0.2.10

### Patch Changes

- Align `agentsmesh init` default `targets` with the shared target catalog (`TARGET_IDS`) so new configs include every supported tool without a duplicate list. Shorten the AgentsMesh sourcing note appended to generated root instructions.

## 0.2.9

### Patch Changes

- Add **Roo Code** as a supported target (`.roo/` rules, commands, skills, MCP, and `.rooignore`).

## 0.2.8

### Patch Changes

- Add Antigravity as a supported target, emit Continue root rules as `.continue/rules/general.md` (while still importing legacy `_root.md`), register built-in targets through target descriptors, and align Continue e2e contracts with the new rule filename.

## 0.2.6

### Patch Changes

- d011602: Add a Starlight documentation site published to GitHub Pages; shorten the npm README and link to the hosted docs for full guides and CLI reference.

## 0.2.5

### Patch Changes

- f7a4afd: Expand the project README, and fix the sample Claude Code PostToolUse hook to use `type: prompt` with a `prompt` field instead of an invalid command-style hook after reads.

## 0.2.4

### Patch Changes

- 98bf8cb: Preserve nested canonical import paths and placeholder metadata; keep nested command picks and Cline workflow exclusions when installing packs; import Cline MCP settings from legacy `.cline/mcp_settings.json` when `cline_mcp_settings.json` is absent; refresh default `.gitignore` patterns for AgentsMesh cache and lock temp files.

## 0.2.3

### Patch Changes

- 8ae253b: Improve Codex CLI rule generation by projecting additional rules to `.codex/instructions/` and linking them from `AGENTS.md` without duplicating the root instructions file.

## 0.2.2

### Patch Changes

- d42b374: Support installing standalone skill repos (bare GitHub/GitLab URLs), use SKILL.md frontmatter name for skill identity, filter repo boilerplate from installed skills, and fix pack skill reference paths in generated output.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.1

### Changed

- npm publish now triggers after GitHub release is created, decoupling version tagging from package publishing

## 0.2.0

### Minor Changes

- bda10c7: Initial public release of AgentsMesh v0.2.0.
  One canonical `.agentsmesh/` source synced to Claude Code, Cursor, GitHub Copilot, Continue, Junie, Gemini CLI, Cline, Codex CLI, and Windsurf. Includes `init`, `generate`, `import`, `diff`, `lint`, `watch`, `check`, `merge`, `matrix`, and `install` CLI commands with full support for rules, commands, agents, skills, MCP servers, hooks, ignore patterns, permissions, local/remote extends, link rebasing, and lock-file-based collaboration.

## [0.1.0] - 2026-03-25

### Added

**CLI commands**

- `init` — Scaffold `agentsmesh.yaml`, `.agentsmesh/rules/_root.md`, and `agentsmesh.local.yaml`; auto-detect existing AI tool configs in the project
- `generate` — Sync canonical `.agentsmesh/` to target tool configs; supports `--targets`, `--dry-run`, `--force`, `--refresh-cache`, `--no-cache`
- `import --from <target>` — Import existing tool configs into canonical form; supports all 9 targets
- `diff --targets` — Show unified diff of what the next `generate` would change
- `lint --targets` — Validate canonical files and target-specific constraints with per-feature diagnostics
- `watch --targets` — Watch `.agentsmesh/` and regenerate on change with 300 ms debounce; self-generated lock file writes do not retrigger the pipeline
- `check` — Verify generated files match the lock file; designed for CI drift detection
- `merge` — Resolve `.agentsmesh/.lock` conflicts after a git merge
- `matrix --targets --verbose` — Show the feature-target compatibility table
- `install` — Install skills, rules, commands, or agents from a local path or remote GitHub/GitLab/git source; supports `--as`, `--sync`, `--dry-run`, `--force`, `--path`, `--target`, `--name`, `--extends`

**Supported targets**

Claude Code, Cursor, GitHub Copilot, Continue, Junie, Gemini CLI, Cline, Codex CLI, Windsurf

**Canonical features**

rules, commands, agents, skills, mcp, hooks, ignore, permissions

**Config**

- `agentsmesh.yaml` — project config with targets, features, and extends
- `agentsmesh.local.yaml` — local-only overrides for targets, features, and personal extends (gitignored)
- `.agentsmesh/` — canonical source directory (source of truth)
- `.agentsmesh/.lock` — generated-state lock file for `check` and `merge`

**Extends**

- Local extends (`local:path` or relative path) — merge shared configs from a relative directory
- Remote extends (`github:org/repo@tag`, `gitlab:group/repo@tag`, `git+ssh://...`) — fetch and cache in `~/.agentsmesh/cache/`

**Link rebasing**

Internal `.agentsmesh/` file references are rewritten to target-relative paths on `generate` and restored to canonical form on `import`, so supporting files and cross-skill links remain correct across all targets

**Collaboration**

- Lock file tracks checksums for all canonical features and extends
- `check` integrates with CI to catch generated file drift
- `merge` recovers from three-way lock file conflicts after `git merge`
