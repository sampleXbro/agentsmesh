---
'agentsmesh': patch
---

`agentsmesh refresh` and `agentsmesh uninstall` no longer report files that AgentsMesh itself wrote as your local edits. When an install merged into an existing pack (the sub-packs of a marketplace `install <source> --all`, a picked subset added to a pack, or the later paths that `install --sync` replays), the pack's `.agentsmesh-install-manifest.json` kept the hashes from the first install only. The new files then showed as `added` and rewritten ones (for example `mcp.json`) as `modified`, so `refresh` without `--force` asked about local edits nobody made, and skipped the pack when you said no. A merge now records the new hashes of the files it writes. Edits you made to other pack files before the merge still show as modified. A pack that an older version merged is fixed when you run the same install again, or `agentsmesh refresh --force`.
