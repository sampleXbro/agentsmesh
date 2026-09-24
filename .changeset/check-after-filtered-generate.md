---
'agentsmesh': patch
---

`agentsmesh check` no longer passes after `agentsmesh generate --targets …` left other targets out of date. Before, a filtered run recorded the new canonical checksums in `.agentsmesh/.lock` even though the targets it skipped were not regenerated, so the CI gate said "Lock file is in sync." while, for example, `CLAUDE.md` was stale. Now a `--targets` run that leaves out an enabled target keeps the lock's previous canonical checksums (and creates no lock if there is none yet), so `check` fails until a full `agentsmesh generate`. A `--targets` list that names every enabled target works like a full run.
