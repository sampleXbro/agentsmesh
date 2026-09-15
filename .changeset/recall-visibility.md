---
'agentsmesh': minor
---

**Added — recall says when the caps hid matches.** `lessons query` already reported a hidden match on stderr, but the hook — the only surface an agent reads mid-session — said nothing, so a recall budget too small for the graph was invisible from inside a run: an agent could see 2 of 18 matching lessons with no way to know the other 16 existed. Hook-injected context now ends with a one-line notice naming the count and the knob when the caps hid anything. Lessons held back by per-session dedup are excluded, since that suppression is deliberate and already reported separately. The notice disappears once the budget fits or the triggers are narrowed.

**Added — `TIED_TRIGGER_SETS` in `agentsmesh lessons validate`.** One aggregate warning for trigger sets shared by more than five active lessons, with every id of the largest group on `lessonIds`. Lessons with identical triggers score identically on trigger specificity, so when more of them match than recall delivers, the choice falls through to topic coherence and rule text and which lessons an agent sees becomes close to arbitrary — the precision problem that a larger budget hides rather than fixes. Derived from the graph alone, so it needs no telemetry. On a mature graph this found 12 such sets covering 172 lessons, the largest holding 26.

**Changed — the default recall budget is now 1200 tokens** (was 400). A graph of a few hundred lessons routinely matched far more than 400 tokens could carry, so most matches were dropped on every call. Hook-driven recall still injects at most 5 rules per call, so the budget matters up to that ceiling and trigger precision matters after it. Projects that set `recallMaxTokens` explicitly keep their value; `init --lessons` writes the new default.
