---
'agentsmesh': patch
---

The MCP server now works for lessons alone, with no `agentsmesh init`. Outside an `agentsmesh.yaml` project it lists only the five lessons tools and no resources, instead of 45 config tools that could only fail with `NO_PROJECT`. Until the first lesson exists, it tells the agent that no setup is needed and that `lessons_add` saves at the git repository root, instead of sending it to run `agentsmesh init --lessons`. The capture that creates the graph, over MCP or `lessons add`, now adds the lessons log, lock and temp files to `.gitignore` (the same lines `init --lessons` writes), so they are no longer committed by mistake.
