---
'agentsmesh': minor
---

The MCP server now hands every client the lessons contract at connection time. `init --lessons` writes a blocking recall/capture rule into your instruction file, but a plugin can ship skills and servers and never that file, so a plugin-only install had no standing instruction at all and recall depended entirely on the agent opening the skill first. The server sends the same three obligations — recall before a mutation, capture after a failure, report the receipt — in tool vocabulary rather than shell, since a client reaching it this way may have no shell. Clients that surface server instructions now show it to the model in every session at no per-call cost.
