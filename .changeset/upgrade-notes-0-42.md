---
'agentsmesh': minor
---

**Upgrade notes.** This release fixes data loss on import and adoption, three security issues, and several generated formats. Most projects need to do nothing, but check these after you upgrade:

- Run `agentsmesh generate` once. Some generated files change format, so `agentsmesh generate --check` reports drift until you regenerate: Claude Code rules scope files with `paths:` (the field Claude Code reads) instead of `globs:`; Windsurf rules use `globs:` instead of `glob:` and a scoped rule is written once (`generate` removes the old `.windsurf/rules/<dir>.md` copy; you can delete an old `<dir>/AGENTS.md` it wrote for Windsurf only); Codex CLI and Codebuff write each rule in a nested `<dir>/AGENTS.md` with an `agentsmesh:embedded-rule` marker.
- If an earlier `import --from codex-cli`, `codebuff` or `windsurf` cycle created a folder rule such as `.agentsmesh/rules/src.md` that repeats another rule's text, delete it once.
- `agentsmesh init` without `--yes` now stops with exit code 1 when it finds existing config for a tool it would enable, because it would not import that config. Use `agentsmesh init --yes`, or `--targets` to leave that tool out.
- `agentsmesh check` now fails after `agentsmesh generate --targets …` left an enabled target out of date (the lock lists it under `stale_targets`). Run a full `agentsmesh generate`. `check()` and `check --json` report these targets as `staleTargets`.
- Importing a second tool now adds to `.agentsmesh/permissions.yaml`, `.agentsmesh/ignore` and `.agentsmesh/mcp.json` instead of replacing them, and never removes an entry; edit those files to remove one. In one `agentsmesh init --yes` run, two tools' rules, commands or agents with the same name and different text are both kept, the later one as `<name>-<tool>.md` (listed as `sameNameCopies` in `init --json`).
- A `root: true` rule from an installed pack or an `extends` source no longer replaces your own `.agentsmesh/rules/_root.md`; it is used as a normal rule, with a warning.
- The MCP server runs tool calls one at a time, in the order they arrive.
- Old lessons stores (`index.yaml` + `topics/` + `journal.md`, up to 0.22): the migration keeps `journal.md`, never runs from the recall hook, and stops with nothing changed if a topic file has a list item outside a `## Rules` or `## Lessons` section.
