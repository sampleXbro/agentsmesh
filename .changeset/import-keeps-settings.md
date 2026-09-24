---
'agentsmesh': patch
---

Importing a second tool no longer drops the settings the first one brought in. Before, `agentsmesh import --from cursor` after `agentsmesh import --from claude-code` replaced `.agentsmesh/permissions.yaml` and `.agentsmesh/ignore` with Cursor's values, so Claude Code `deny` rules that protect secrets were lost without a word, and the next `generate` removed them from `.claude/settings.json`. Some importers (Gemini CLI, Cline, Windsurf, Crush) also replaced `.agentsmesh/mcp.json`. Now each import adds its permissions (`allow`, `deny`, `ask`), ignore patterns and MCP servers to the canonical files and keeps the ones already there; for an MCP server with the same name, the later import wins. This works the same for `import`, `init --yes`, the `importFrom()` API, the MCP `import` tool, and plugin targets. Import never removes an entry from these files; to drop one, edit the canonical file.
