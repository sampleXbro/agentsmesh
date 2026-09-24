# Lessons system — investigation report

**Date:** 2026-06-26
**Branch:** `feat/lessons-verification-instruments` (off `develop`)
**Companion:** [`lessons-strategy.md`](./lessons-strategy.md) (forward-looking strategy),
[`flows/lessons.md`](./flows/lessons.md) (recall/capture flow).

This report consolidates a session of investigation into whether the agentsmesh
lessons system actually *works* — not whether the graph is well-formed, but
whether the right lesson reaches the agent at the right moment and is not a
write-only artifact. It records what was built, what was measured, what was
corrected, and — honestly — what remains unmeasured.

---

## 0. TL;DR

The community asked, in effect: *do these "lessons" protect anyone, or are they
beautifully-stored notes nobody reads?* We built and committed three instruments
to answer it, each verified adversarially:

| Question | Instrument | Verdict |
| --- | --- | --- |
| Does the **right** lesson fire (and adjacent ones stay silent)? | Recurrence harness (A) | The ranker discriminates — **mutation-proven, 7/7**. |
| **Can** each real lesson fire on the mandatory path? | Reachability audit (A.2) | **0 inert**; 76% file-reachable on the real graph. |
| Does recall fire **before** the edit, not after / not trusted to the model? | Deterministic recall (D) | **Yes** — a PreToolUse first-touch guard. |

Two corrections came out of it: a **documented falsehood** ("PreToolUse hooks
can't inject context") was refuted against the primary source, and an earlier
**hypothesis was overturned** ("our real lessons are probably partly inert" —
they are not). The honest frontier nothing here measures is **effectiveness**:
whether a reachable, correctly-firing, deterministically-injected lesson is
actually *obeyed* and improves output.

---

## 1. Origin: the community feedback

Feedback on the lessons feature, structured by signal:

| Theme | Core claim | Kept? |
| --- | --- | --- |
| Retrieval trigger | Does recall actually fire before an edit, or is the model trusted to ask? | High → **Workstream D** |
| Staleness | A lesson about a thing that changed is *worse* than none. | High → **Workstream C** |
| Contracts > implementations; tests-as-docs | Bias toward durable triggers. | Kernel → C |
| Authorship | The same failing loop authors its own lesson (single-party). | High → Workstream B |
| **Two-gate model** | Admission ("may this enter memory?") ≠ protection ("will it fire at recurrence?"); planted faults; precision *and* recall both directions; decoys authored outside the validator's distribution. | Highest → **Workstream A** |
| Token-priority "waterfall" / Markov salience | Re-described embedding recall; the "free because cache hits" claim is wrong. | Discarded (kernel: embeddings as an *additional* signal) |

The structured analysis surfaced one organizing question — **do lessons protect
at recurrence?** — and one organizing frame, below.

---

## 2. Frame: the two-gate model

A lessons system has two orthogonal gates; passing one says nothing about the other.

- **Admission gate** — "may this enter memory?" — the `active`/`deprecated`/`superseded`
  lifecycle plus capture guardrails. *Largely pre-existing.*
- **Operational-protection gate** — "will it fire at recurrence and stay silent on
  adjacent contexts?" — a planted-fault recurrence harness. *Built (A).*

Conflating them is exactly how a graph becomes a well-formed **write-side artifact**
that is never verified at the operational layer.

---

## 3. Investigation A — does the *right* lesson fire? (recurrence harness)

**The seam.** The recall ranker has a *pure* core: `queryLessons(graph, query)` →
`rankLessons(graph, query, matches, {limit})`, both pure over an in-memory
`LessonsGraph`. So the real ranker can be run against a **controlled fixture
graph** — which structurally satisfies commenter #5's constraint: measure
*retrieval discriminability*, not *graph hygiene* (the fixture graph is never run
through the graph-quality validator).

**The fixture model.** A suite = a graph + cases. Each case is a recall context
(`file`/`command`/`keyword`) that labels **every** lesson as either should-fire
(planted fault) or should-stay-silent (decoy / adjacent negative / deprecated).
A **complete-labeling** invariant guarantees the false-positive direction is
always measured. Metrics are bidirectional and micro-averaged: precision, recall
(catch rate), and **false-positive rate** on adjacent contexts.

**Hardening (making 1.0 *mean* something).** The first fixture used trigger-disjoint
cases, so a perfect score only proved plumbing. A design fan-out enumerated ranker
failure modes; an adversarial review then found three real coverage gaps a green
gate was hiding. The hardened suite has **8 mechanism suites** isolating: specificity
(inverse-fanout dominance), **matched-set-local** topic coherence (a strict subset of
the corpus, so a corpus-global mutation flips it), BM25 tie-break, createdAt + id
tie-breaks, top-N truncation, status exclusion (deprecated + superseded), and keyword
semantics (token-run contiguity, explicit-substring, stopword-empty). A suite-level
**negative control** (built inline in the integration test, not the hard-suites
fixture) proves the gate reports a leak. Per-case `topN` was added —
discrimination cases need a tight cap (at a loose cap every matched lesson is
retrieved, so a matched lesson can never be forbidden and rank order is never
exercised).

**Mutation testing (the proof the gate bites).** During development, each ranker
regression below was injected into the source, the gate run, confirmed **red**, then
reverted — a transient procedure, **not a committed script**. The standing committed
artifact is the **hard-suites fixture**: each suite isolates one mechanism so its case
turns red if that mechanism is disabled, codifying these as regression tests:

| Mutation | Gate |
| --- | --- |
| specificity weight → 0 | red ✓ |
| topic-coherence weight → 0 | red ✓ |
| BM25 weight → 0 | red ✓ |
| createdAt tie-break reversed | red ✓ |
| id tie-break reversed | red ✓ |
| stopword filter removed | red ✓ |
| status filter removed | red ✓ |

**7/7 caught.** That is the difference between "scores 1.0" and "1.0 means the
ranker discriminates." Reproduce by disabling a mechanism — e.g. set a weight to 0 in
`ranking.ts`, or reverse a tie-break — and re-running the recurrence gate.

**Verdict.** The ranker discriminates, mutation-proven. **Limit:** it measures
discriminability on *planted* faults over a controlled graph — not real recurrences.

---

## 4. Investigation A.2 — *can* a lesson fire? (reachability audit)

A second instrument, pointed at the **real** graph: for each active lesson, can it
fire on the mandatory `--file`/`--cmd` recall path? It reuses the system's canonical
liveness predicates (`fileGlobLiveness`, `isSafeRegexPattern`, keyword tokenization),
so it agrees with how `validate`/capture judge liveness everywhere else.

**The four tiers are deliberately asymmetric about what is statically verifiable:**

- `file-reachable` — a `file_glob` matches a file in the working tree (**verified vs
  ground truth**).
- `command-pattern` — a *valid* `command_pattern`. We can confirm only that it
  *compiles*; there is no command corpus to test "matches a real command," so this is
  kept a **separate tier**, not summed into "reachable."
- `keyword-only` — only a live keyword (fires only if the keyword surfaces as a
  path/command token — conditional).
- `inert` — no live trigger at all: captured, never recalled.

**The honest tier split was forced by an adversarial review** (Finding: file-glob
liveness is verified against the tree, but command-pattern "liveness" was only
"compiles" — conflating them into one tier overstated reachability). The split is why
the headline is 76%, not the initially-reported 99.4% (which summed file-reachable +
command-pattern).

**Empirical result, real graph (358 active lessons):**

| Tier | Count | Share |
| --- | --- | --- |
| file-reachable (verified) | 272 | 76.0% |
| command-pattern (valid, unverified-vs-commands) | 84 | 23.5% |
| keyword-only | 2 | 0.6% |
| **inert** | **0** | **0.0%** |

Glob breadth (Finding-5 caveat): of 179 file_globs, **144 match ≤10 files** (narrow),
only 10 match >100; just **12 / 272** file-reachable lessons rely solely on a broad
glob. So the 76% is **not** breadth-inflated.

**Telemetry (2083 real recalls, disjoint partition of the same records):** 41.0%
truly no-match (mostly commands — correct quiet), 48.3% matched-but-all-deduped
(already shown that session — correct anti-spam), 10.7% delivered ≥1 new. Of
*file-edit* queries, only **5.8% had no match** (94.2% matched ≥1).

**Hypothesis overturned.** Going in, the expectation was "given the dead-glob we hit
mid-session (below), our real lessons are probably partly inert." The measurement
says the opposite: **0 inert**, 76% verified-reachable. The capture guardrails
(UNRECALLABLE block, DEAD_GLOB auto-prune, KEYWORD_ONLY warnings) keep the graph
healthy. *This is why you measure instead of assuming.*

**Verdict.** In this graph, lessons are **not** write-only artifacts. **Limit:**
reachable ≠ effective — see §8.

---

## 5. Investigation C — staleness (mostly already shipped)

Workstream C ("re-resolve each referent; mark stale when gone/changed") turned out
to be **~80% already implemented** in `validate`: `collectDeadFileGlobs` (gone),
`collectRunnerAnchoredPatterns` (scope drift), `collectStopwordKeywords` /
`collectLowSignalKeywords` / `collectFanout` (decay), `collectOrphans`,
`collectDanglingRefs`; `stats.ts` covers the telemetry side; the reachability audit
(A.2) covers the inert tier. The only genuinely-new tractable residue was
**usage-staleness** (reachable-but-never-delivered), a noisy/telemetry-dependent
signal. The hard core ("referent exists but its *meaning* changed") is statically
intractable. **Decision: do not build a redundant instrument.**

---

## 6. Investigation D — does recall fire *before* the edit? (deterministic recall)

**The gap.** Pre-edit recall was *instruction-gated* (a BLOCKING contract trusting
the model), and the only hook was **PostToolUse-reactive** — its own comment admitted
*"the first touch of a file is unguarded."*

**The load-bearing fact, and a correction.** The repo docs contained a section *"Why
`PostToolUse` and not `PreToolUse`?"* asserting *"Pre-tool hooks… cannot inject text
into the model's context."* That belief is what forced the reactive-only design.
A `claude-code-guide` agent **repeated the false claim**. Fetching the **official
docs** (`code.claude.com/docs/en/hooks`) confirmed the opposite: **PreToolUse does
support `hookSpecificOutput.additionalContext`** ("for injecting context to Claude
before the tool runs"). Primary-source verification overruled both the agent and the
repo's own docs.

**The change (surgical, backward-compatible).** `buildRecallHookOutput` is now
**event-aware**: it echoes the harness's `hook_event_name` (defaulting to
`PostToolUse` for absent/unknown events — byte-identical old behavior), so the same
`agentsmesh lessons hook` command serves as a **PreToolUse** hook that injects
matching lessons *before* the edit (guarding the first touch, with no blocking and no
permission interrupt) or a PostToolUse fallback. The scaffold now wires the hook under
**both** events; session dedup keeps a lesson injected at most once.

**Adversarial review: ship.** Its one substantive flag — the `hookSpecificOutput`
JSON is Claude-Code/Copilot-shaped yet projected to all hook-capable targets — is
**pre-existing** (the PostToolUse hook already emitted the same JSON everywhere); the
dual wiring *is* the answer (PreToolUse where supported, PostToolUse fallback, silent
no-op otherwise).

**Verdict.** The first touch is now deterministically guarded. **Limits:** PreToolUse
`additionalContext` support is harness-specific (hence the Post fallback); on Claude
Code both hooks fire per edit (the Post run de-duplicates to nothing — a minor extra
recall run, not a double injection). The **embedding-similarity ranking signal**
(D's other half) is deferred — a separate effort needing a model.

---

## 7. Cross-cutting findings

- **We caught the disease on ourselves, then measured it's rare.** Mid-session, a
  lesson captured for this very work had its `file_glob` **auto-pruned as a dead
  glob**, degrading it to keyword-only. That looked like the "write-only artifact"
  failure mode — admission passed, protection weakened. But A.2 then measured that
  this is the exception: the auto-prune is part of the *immune system*, and only 2/358
  active lessons are keyword-only. The anecdote was not the distribution.
- **Primary-source verification beat confident assertions — twice.** The
  `claude-code-guide` agent asserted (wrongly) that PreToolUse can't inject context;
  the design fan-out proposed fixture sketches with wrong `topN`. In both cases,
  checking the actual code/docs corrected the error. Adversarial review caught three
  coverage gaps a green harness was hiding, and the command-vs-glob reachability
  conflation.
- **Backward compatibility.** A and A.2 are purely additive (new modules). D modifies
  existing code but preserves old behavior by default (absent `hook_event_name` →
  PostToolUse). The one non-invisible effect: the scaffold now emits a PreToolUse hook
  entry, so re-running `init`/`generate` changes generated artifacts (additively).
  The only genuine *fix* was the documentation falsehood in §6.

---

## 8. The honest ledger: verified vs unmeasured

```
Can a lesson fire?            (reachability)        VERIFIED — 0 inert, 76% file-reachable
Does the RIGHT one fire?      (recurrence harness)  VERIFIED — mutation-proven 7/7
Does it fire BEFORE the edit? (deterministic recall) VERIFIED — PreToolUse first-touch guard
Is it OBEYED / does it help?  (effectiveness)       UNMEASURED — needs labeled outcomes
```

The three instruments establish that lessons are reachable, discriminating, and
deterministically injected. None of them — and nothing statically buildable — measures
whether a delivered lesson changes behavior for the better. That is the real open
question; it requires labeled outcomes (was the lesson read, obeyed, did the result
improve), not another static analyzer. Naming it is more honest than implying the
instruments cover it.

---

## 9. Methodology notes (reusable)

- **Fixtures outside the validator's distribution** — the recurrence suite is never run
  through the graph-quality validator, so it measures retrieval, not hygiene.
- **Mutation testing** — a discrimination harness is only meaningful if injected
  regressions turn it red; verify that explicitly.
- **Adversarial fan-out review** — independent skeptics, prompted to refute, caught
  defects (coverage gaps, the reachability tier conflation) that a green test suite
  hid. Triage them: some were real, one rejected (a misread of the metric), several
  were honest caveats.
- **Verify against the primary source**, not a confident summary — twice decisive.
- **Tight per-case `topN`** for any ranking-discrimination fixture; at a loose cap the
  case only proves trigger plumbing.

---

## 10. Open questions & next

- **B — authorship integrity.** Two-party capture (an independent, evidence-only
  proposer) so the failing loop doesn't solely decide what to remember. Not started.
- **D-embeddings.** Embedding similarity as an *additional* ranking signal — needs a
  model; admit only if it moves the harness number.
- **Effectiveness.** The §8 frontier — instrument whether delivered lessons are obeyed
  and improve output. Needs labeled outcomes.

---

## Appendix A — artifacts

**New source:** `src/lessons/recurrence/{types,metrics,evaluate,suite}.ts`,
`src/lessons/reachability.ts`. **Modified:** `src/lessons/hook.ts`,
`src/lessons/recall-hook-scaffold.ts`. **Fixtures:**
`tests/fixtures/lessons/recurrence/{suite,hard-suites}.json`. **Tests:**
`tests/unit/lessons/recurrence-{metrics,evaluate,suite}.test.ts`,
`tests/unit/lessons/reachability.test.ts`,
`tests/integration/lessons-{recurrence,reachability}.integration.test.ts`, plus
updates to `hook.test.ts`, `recall-hook-scaffold.test.ts`, and the lessons e2e suites.

**Commits (`feat/lessons-verification-instruments`, newest first):**

```
chore(lessons): capture PreToolUse capability lesson and update plan
docs(lessons): correct PreToolUse hook capability and recall-hook wiring
feat(lessons): deterministic pre-edit recall via PreToolUse hook
chore(lessons): capture session lessons and update task plan
feat(lessons): static reachability audit of the lessons graph
feat(lessons): recurrence harness for ranker discrimination
docs(lessons): add feedback analysis and gap-closing strategy
```

## Appendix B — captured lessons (graph)

- `test-execution-place-agentsmesh-src-unit-tests` — unit tests live under
  `tests/unit/`, not colocated in `src/` (vitest include / coverage include).
- `fixture-and-assertion-discipline-when-adding-a-ranking-discrimination` — tight
  per-case `topN` + matched-subset + mutation-test the fixture.
- `lessons-system-a-command-pattern-trigger-s` — command-pattern reachability is not
  statically verifiable like a file_glob; keep the tiers separate.
- `lessons-system-claude-code-s-pretooluse-hook` — PreToolUse supports
  `additionalContext` (primary-source verified); don't claim otherwise.

## Appendix C — key numbers (for reproducibility)

> **These are point-in-time snapshots from the audit runs during this session.**
> The graph and telemetry log grow as work continues — notably, this session's own
> 4 captured lessons grew the graph by 2 active lessons between the audit and the
> end of the session. A same-session re-run gave 360 active / **274 file-reachable**
> / 84 command-pattern / 2 keyword-only / **0 inert** and 2169 telemetry records —
> the exact counts drift, the conclusions (0 inert, ~76% file-reachable) do not.

- Real graph: 392 lessons (358 active, 4 deprecated, 30 superseded); 361 triggers
  (179 file_glob, 108 keyword, 74 command_pattern); 0 active lessons with no triggers.
- Reachability: 272 file-reachable / 84 command-pattern / 2 keyword-only / 0 inert;
  6353 working-tree files walked; glob-breadth histogram {1-10:144, 11-100:25,
  101-1000:9, 1000+:1}; 12/272 broad-glob-only.
- Telemetry: 2083 recalls — 853 no-match / 1007 matched-but-deduped / 223 delivered;
  file queries 502 (29 no-match), command queries 1604 (827 no-match).
- Recurrence: smoke suite 6 cases (5 TP / 0 FN / 0 FP / 31 TN, precision/recall 1.0,
  fp-rate 0.0); 8 hard mechanism suites + 1 negative control; 7/7 mutations caught.
