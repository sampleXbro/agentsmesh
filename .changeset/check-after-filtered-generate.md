---
'agentsmesh': patch
---

`agentsmesh check` no longer passes after `agentsmesh generate --targets …` left other targets out of date. Before, a filtered run recorded the new canonical checksums in `.agentsmesh/.lock` even though the targets it skipped were not regenerated, so the CI gate said "Lock file is in sync." while, for example, `CLAUDE.md` was stale. Now, when the canonical sources changed, the lock lists the enabled targets the run left out under a new `stale_targets` key, and `check` fails and names them (`staleTargets` in `--json`, the MCP `check` tool and the `check()` API) until each is generated again. A full `agentsmesh generate` clears the list, and the lock does not change for projects that never use `--targets`.
