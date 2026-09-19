---
'agentsmesh': minor
---

**Fixed — a pure read no longer counts as a failure, or escalates like one.** The lessons rule has always told agents that pure-read commands are exempt from the ritual, but nothing on the hook path implemented it. Any tool call carrying an error was recorded, with no filter, so a `grep` exiting 1 because it matched nothing, a `cat` of a missing path, and a `find` with a bad predicate all logged failures. Because the action key collapses a command to its program plus one word, those piled into buckets like `cmd:cat` and `cmd:grep`, and two of them were enough to trigger `RECURRENT FAILURE: this exact action has failed N× before` in front of an ordinary read. On this repository's own log, read-only classes were the top eight failure keys.

Commands are now classified before they are recorded or escalated. The classifier is conservative by design: an allowlist of reading programs, `git` limited to its reading subcommands, and any sign of writing — a redirect to a path, `sed -i`, `find -delete` or `-exec`, an unknown program, a path-shaped program — disqualifies the whole command, including every segment of a pipeline. A false negative only restores the previous behaviour; a false positive would swallow a real failure.

**Fixed — the truncation notice named a setting that could not help.** Hook recall injects at most five rules per call, a ceiling that overrides the configured recall limit, so on any sizeable graph the count is what truncates. The notice nevertheless told the reader to raise `recallMaxTokens`, which changes nothing in that case. It now names whichever cap actually bound: the per-call ceiling, with the advice to narrow triggers, or the token budget, with the knob that governs it.
