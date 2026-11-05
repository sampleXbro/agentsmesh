---
'agentsmesh': minor
---

**Upgrade notes.** This release stops packs, `extends` sources and imports from overwriting settings you already have in your tools. Most projects need to do nothing, but check these after you upgrade:

- If your project took its ignore patterns from installed packs or `extends` sources, add them to your own `.agentsmesh/ignore` before you run `generate`. Otherwise `generate` skips them with a warning and removes the ignore files it wrote from them, so a path they hid, such as `.env`, is visible to your tools again.
- The same rule applies to MCP servers, permissions and hooks: values from packs and `extends` now join only settings your own files manage, and `generate` prints a "Skipped … from installed packs or extends" warning for the rest. To keep them, opt in once: list your servers under `"mcpServers"` in `.agentsmesh/mcp.json` (`agentsmesh import --from <tool>` copies in the ones your tools have; `{}` is fine for a project with no servers of its own, but never leave it empty in `~/.agentsmesh/mcp.json`, where an empty list makes Claude Code, Zed and Goose drop every global server), the empty lists you want (`allow: []`, `deny: []`, `ask: []`) in `permissions.yaml`, or `{}` in `hooks.yaml`.
- A list missing from `permissions.yaml` is now left alone in your tools. Empty lists that older imports wrote (`deny: []`, `ask: []`) still count as "none" and still clear those lists in your tools, so delete any you did not mean to keep. A file where every list is empty is now applied by Cursor, Qwen Code and Pi too (0.42 skipped it there): Cursor and Qwen Code empty their lists, and Pi gets `defaultTools: []`, which turns off its built-in tools. Plugin authors: `Permissions.allow` and `Permissions.deny` are now optional, like `ask`.
- `init --global` and `import --global` no longer add the AgentsMesh MCP server. An entry an older version added stays and keeps working; the changelog entry for this change says how to remove it.
