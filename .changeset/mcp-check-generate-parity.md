---
'agentsmesh': patch
---

The MCP `check` and `generate` tools now tell the same story as the CLI. `check` runs the same check as `agentsmesh check`, so an unreadable `.agentsmesh/lessons/lessons.json` (a merge conflict, bad JSON, a schema error or a newer version) is now reported in a new `lessonsGraphError` field, with the same text as the CLI JSON `error`, instead of looking like a clean result. `generate` sets `lockfileUpdated` only when the run really rewrote `.agentsmesh/.lock`; a run that changes nothing leaves the lock alone and now says `false`.
