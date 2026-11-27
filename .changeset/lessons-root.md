---
'agentsmesh': patch
---

`lessons add` run from a subfolder of a git repo that has no lessons yet now saves at the repository root, the same place the MCP tools use, instead of creating a second store in the subfolder. Lessons lookups (CLI, recall hook and MCP) now stop at the first `.git` folder or file, so a nested worktree or submodule no longer reads its parent checkout's lessons.
