---
'agentsmesh': patch
---

**Fixed — output boundary check runs before any write, and under `--dry-run`.** `generate` and `convert` now check every output path and every managed directory of the active targets against the project (or home) boundary before writing anything. Previously a managed directory that produced no output this run — `.cursor/agents` with agents disabled, say — was first checked during stale cleanup, after every file had been written and before the lock was saved, so a symlink escaping the boundary left a half-generated project with no lock and `check` reporting "not initialized" on every rerun. `--dry-run` now runs the same check, so a preview no longer reports OK for a layout the real run rejects. The error names the path, where it resolves to, and the boundary it escapes.
