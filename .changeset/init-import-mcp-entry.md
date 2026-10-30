---
'agentsmesh': patch
---

Project `agentsmesh init --yes` now adds the AgentsMesh MCP server when it imports your existing MCP servers. Before, the imported `.agentsmesh/mcp.json` was kept as it was, so the `agentsmesh` entry was missing, while `agentsmesh import` added it. `agentsmesh import` also no longer warns that it "left `.agentsmesh/mcp.json` untouched because it contains comments" when the file already has the `agentsmesh` entry, as the commented file that project `init` writes does. The warning still shows when a commented file has no entry. `init --global` and `import --global` still never add the entry.
