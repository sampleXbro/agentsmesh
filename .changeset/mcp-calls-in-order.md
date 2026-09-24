---
'agentsmesh': patch
---

The MCP server no longer loses changes when a client sends several write calls at once. Each write tool reads a file, changes it and writes it back, so parallel calls such as three `add_mcp_server`, `update_permissions` (append), `update_ignore` (append) or `update_config` calls kept only one change while all of them reported success. `agentsmesh mcp` now runs tool calls one at a time, in the order they arrive.
