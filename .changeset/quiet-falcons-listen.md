---
'agentsmesh': minor
---

**Fixed — the recurrence gate could not tell one recurring problem from unrelated failures.** It escalated with `RECURRENT FAILURE: this exact action has failed N× before`, but the action key is deliberately a class: `cat a.txt` and `cat b.txt` are both `cmd:cat`. Six unrelated errors under one program therefore looked identical to the same error six times, which is how an ordinary read came to be announced as a recurring defect.

The gate was designed around a coarse error signature to prevent exactly this, and the signature had never worked. Harnesses report a failed call in different places: some send a plain `tool_error` string, while Claude Code sends a structured `tool_response`. The extractor accepted only a plain string, so every failure this project has ever recorded carried no error class at all. Failure text is now read from either shape, trying conventional fields (`stderr`, `error`, `message`, `stdout`) in specificity order rather than per harness.

With a signature available, escalation requires the **same error** to have recurred, not merely the same program. Where the harness reports no error text, nothing is claimed and the gate stays silent, because without a signature there is no evidence that one problem repeated. The message now states what was measured.

**Fixed — the truncation notice named a setting that could not help.** Hook recall injects at most five rules per call, a ceiling that overrides the configured recall limit, so on any sizeable graph the count is what truncates. The notice nevertheless told the reader to raise `recallMaxTokens`, which changes nothing in that case. It now names whichever cap actually bound.
