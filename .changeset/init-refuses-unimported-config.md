---
'agentsmesh': patch
---

`agentsmesh init` no longer sets up a silent overwrite of your existing tool config. In a script or CI shell (no wizard) and without `--yes`, `init` used to find existing config, print only a hint to import it, and still enable that tool, so the next `agentsmesh generate` replaced it: in `--global` mode your `~/.claude/CLAUDE.md` and the MCP servers in `~/.claude.json`, which git cannot restore. Now `init` stops with exit code 1 and writes nothing when a tool it would enable already has config. Run `agentsmesh init --yes` to import that config first, or pass `--targets` to leave the tool out. The interactive wizard is unchanged.
