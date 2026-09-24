---
'agentsmesh': minor
---

**Upgrade notes.** Most projects need to do nothing, but check these after you upgrade:

- Run `agentsmesh generate` once. Hooks for Gemini CLI, GitHub Copilot, Cursor and Windsurf, lessons recall hooks, and hooks from installed packs can be generated differently now, so `agentsmesh generate --check` reports drift until you regenerate.
- Run `agentsmesh lessons validate`. Some lesson file triggers no longer match anything, and `lessons validate` and `agentsmesh lint` now report them as `UNSAFE_GLOB_PATTERN` errors: `**` inside a name (`src/**.ts`, write `src/**/*.ts`), extglobs (`+(a|b)`, write `{a,b}`) and ranges (`{1..3}`, write `{1,2,3}`).
- Gemini CLI hooks match exact tool names now. `Bash`, `Edit`, `Write` and `Read` reach Gemini's own tools (before, they matched nothing there), but a partial Gemini name such as `shell` no longer matches: use the full name (`run_shell_command`) or the Claude Code name (`Bash`). A `UserPromptSubmit` hook now also runs on Gemini, as `BeforeAgent`.
- `SessionStart` and `PostToolUseFailure` hooks now also reach GitHub Copilot, and `PostToolUseFailure` hooks reach Cursor.
- The lessons outcome log (`.agentsmesh/lessons/outcome-log.jsonl`, local and gitignored) is on by default, and turning telemetry off no longer stops it. Turn it off with `"outcomeLog": false` in `.agentsmesh/lessons/config.json` or `AGENTSMESH_LESSONS_OUTCOME_LOG=0`.
- `agentsmesh lessons` exits 2 for a flag with an empty value, so a script that runs `--cmd "$CMD"` fails when `CMD` is empty.
- Installing the same whole source again rebuilds its pack, so files you added by hand inside `.agentsmesh/packs/<name>/` are removed, as `refresh` already did. Keep your own changes in `.agentsmesh/`, outside `packs/`.
