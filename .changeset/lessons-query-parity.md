---
'agentsmesh': patch
---

`lessons query` now ranks and de-duplicates like the MCP `lessons_query` tool and the recall hook: `--always` rules are shown once per session (use `--no-dedup` to see them again), and a lesson that kept failing after delivery is down-ranked in the CLI too. A relative `--file` typed in a subfolder is now read from that folder, and the "output is capped" hint points to `--format json`. Recall also reports a failed legacy migration instead of hiding it.
