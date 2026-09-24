---
'agentsmesh': patch
---

`agentsmesh generate` no longer rewrites `.agentsmesh/.lock` when nothing changed. Before, a run that printed "Nothing changed" still wrote a new `generated_at`, so the git tree was dirty after every `generate` and each teammate's run showed a lock diff. Now the lock is rewritten only when its `checksums`, `extends`, `packs` or `outputs` change; otherwise the file stays byte-for-byte the same. `generated_at`, `generated_by` and `lib_version` now describe the last run that changed the lock. `check`, `generate --check` and `watch` work as before.
