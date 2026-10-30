---
'agentsmesh': patch
---

Remote `extends` and `install` sources now work when agentsmesh runs inside a git hook. In a hook run from a linked worktree, git sets `GIT_DIR` and `GIT_INDEX_FILE`, and the git that agentsmesh started to clone a remote inherited them. The clone then wrote its files into your repo's index (your staged changes were replaced), a pinned ref failed with `git checkout` errors, and an unpinned extend was locked to your own repo's HEAD instead of the remote's commit. agentsmesh now drops the variables that point git at one repo (`GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE` and the rest of `git rev-parse --local-env-vars`, except the `GIT_CONFIG*` ones) before it runs git for a remote, so the cache clone is always its own repo.
