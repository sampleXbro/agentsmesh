---
'agentsmesh': patch
---

`agentsmesh check` now gives the fix that matches the drift it found, instead of always saying "Run 'agentsmesh merge' to resolve, or 'agentsmesh generate --force' to accept current state." For canonical or generated-output drift (including the stale hashes a `merge` can leave) it points to plain `agentsmesh generate`; only changed locked features (`collaboration.strategy: lock`) get the `generate --force` advice. A `.agentsmesh/.lock` with git conflict markers is now reported as a lock conflict with the `agentsmesh merge` fix (and `lockConflict: true` in `--json` and in the MCP `check` tool result), instead of "Not initialized for collaboration".
