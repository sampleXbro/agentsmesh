---
'agentsmesh': patch
---

**Added — the recall log records which action it was for.** `lessons stats` reports a held-rate and correctly calls it a weak upper bound, because a delivery with no recorded repeat is not proof of prevention. The missing piece was exposure: the log proved a recall happened but not for which action, so occurrences per action could not be counted and no before/after rate was computable.

Each recall record now carries the normalized `contextKey` the outcome log already stores (`file:src/x.ts`, `cmd:git commit`, or `none` for a keyword-only query), so this adds no content the logs did not already hold and never records a raw command. Telemetry remains opt-in and off by default. Records written before this change have no key and are reported as such rather than silently skewing an average.
