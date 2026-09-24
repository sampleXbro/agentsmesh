---
'agentsmesh': minor
---

The MCP server now tells every client about lessons when it connects, and says something true in both states.

Where a project has lessons, the server hands over the same recall and capture contract that `init --lessons` writes into your instruction file. That matters for a plugin: a plugin can ship skills and servers but never your instruction file, so a plugin-only install previously had no standing instruction at all and recall depended on the agent opening the skill first. The obligations are phrased in tool names rather than shell commands, since a client reaching the server this way may have no shell.

Where a project has no lessons, the server says so plainly and explains how to start one. It does not name a graph file you do not have, does not point at a skill you never installed, and mandates nothing. This matters because the server also carries the configuration tools and is documented on its own: most people who wire it up never opted into lessons, and they should not be told to query a memory that cannot answer.
