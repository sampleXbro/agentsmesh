---
'agentsmesh': patch
---

Scripts and AI agents now see which settings from packs and `extends` were skipped. When your own canonical files do not manage MCP servers, permissions, hooks or ignore patterns, `generate` skips those values from packs and `extends` with a warning, but `--json` hides warnings and the MCP tools did not report it. Now `generate --json` and `install --json` data has a `skippedSettings` list (`[{ "feature": "mcp", "items": ["context7"] }]`, only present when something was skipped), the MCP `generate` tool returns `skippedSettings` and puts the warning text in `warnings`, and the MCP `install` tool returns `skippedSettings` like `install --json`. The warning in normal output still prints once.
