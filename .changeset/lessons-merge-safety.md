---
'agentsmesh': patch
---

The lessons recall hook now warns before `git add`, `git commit` or a `--continue` of a merge, rebase or cherry-pick while `lessons.json` is still in a conflict that the merge driver did not finish, so the other branch's lessons are not dropped by accident. `lessons validate` and `lessons resolve` no longer call a repaired merge result data loss (resolve keeps it and says it is already resolved), read files that start with a UTF-8 BOM, and use the common ancestor that fallback conflict markers now keep. The merge driver also warns on stderr when it cannot read the common ancestor.
