---
'agentsmesh': patch
---

Project `agentsmesh init --yes`, and the interactive `init` when you choose to import, now add the AgentsMesh MCP server when they import your existing MCP servers. Before, the imported `.agentsmesh/mcp.json` was kept as it was, so the `agentsmesh` entry was missing, while `agentsmesh import` added it. `agentsmesh import` also no longer warns that it "left `.agentsmesh/mcp.json` untouched because it contains comments" when the file already has the `agentsmesh` entry, as the commented file that project `init` writes does. The warning still shows when a commented file has no entry. `init --global`, `import --global`, and project commands run in your home folder still never add the entry.
