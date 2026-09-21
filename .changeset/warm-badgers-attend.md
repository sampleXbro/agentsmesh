---
'agentsmesh': minor
---

**Fixed — lessons over MCP no longer require an initialized project.** `lessons_query` and the other lessons tools rejected every call in a directory without `agentsmesh.yaml` with `NO_PROJECT`, while the CLI did the opposite: `agentsmesh lessons query` printed a setup hint and exited 0, and `lessons add` created the graph. Since MCP is the documented path for an agent with no shell — and the only path a Claude Code plugin has — the feature was unreachable for exactly the callers it was meant to serve. All five lessons tools now fall back to the working directory. Config tools such as `generate` still require a project and still report `NO_PROJECT`.
