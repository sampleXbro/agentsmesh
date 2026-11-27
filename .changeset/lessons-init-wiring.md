---
'agentsmesh': patch
---

`agentsmesh init --lessons` on a project set up earlier now creates `.agentsmesh/hooks.yaml` when it is missing and wires the recall hook into it, so `generate` projects the hook. The init output always says what happened to the hook (created, wired, already current, or skipped and why), and a re-run keeps a matcher you narrowed in `hooks.yaml`. Both `init --lessons` and `generate` now warn when `hooks` is missing from `features`, because the recall hook would never reach any tool.
