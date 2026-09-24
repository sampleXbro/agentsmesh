---
'agentsmesh': patch
---

The MCP `install` and `uninstall` tools no longer write plain-text notices into the JSON-RPC stream. When an installed skill had a broken link, or an uninstalled pack had locally changed files, `agentsmesh mcp` printed those notices on stdout, which stricter MCP clients cannot parse. They now go to stderr like every other message from the server. With `--json`, the CLI no longer prints them into the JSON output either.
