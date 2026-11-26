# Lessons Flow

> **The one big idea:** *Lessons* give an AI coding agent a **memory of past mistakes**.
> It **reads** that memory *before* it touches anything, and **writes** to it *after* something goes wrong — so the same mistake doesn't happen twice, in any tool.

That memory is a single git-tracked file: `.agentsmesh/lessons/lessons.json`. Every agent (Claude, Cursor, Codex, Copilot, …) reads and writes the *same* file through two commands.

## The daily loop

Two habits, repeated all day: **Recall before you act**, **Capture after a failure**.

```mermaid
flowchart TD
    Start([Agent is about to edit a file<br/>or run a state-changing command])
    Start --> Recall{{RECALL<br/>agentsmesh lessons query}}
    Recall --> Hits[Gets back the rules that<br/>match this file / command]
    Hits --> Apply[Agent follows those rules<br/>while doing the work]
    Apply --> Outcome{Did something go wrong?<br/>failing test, code review,<br/>wrong assumption...}
    Outcome -- no --> Start
    Outcome -- yes --> Capture{{CAPTURE<br/>agentsmesh lessons add}}
    Capture --> Start

    Graph[("lessons.json<br/>the shared memory")]
    Recall -. reads .-> Graph
    Capture -. writes .-> Graph
```

- **Recall** runs *before* an edit or a state-changing command (build, test, install, git-write). It asks the graph "any rules for this file or command?" and the agent applies whatever comes back. Pure reads (`cat`, `ls`, `grep`) are exempt.
- **Capture** runs *right after a failure* — and "failure" is broad: a red test, a lint/type error, a code review comment, a regression, or just a wrong assumption. The agent writes down the rule so next time, Recall surfaces it.

## What's inside one lesson

A lesson is a short **rule** plus one or more **triggers** that decide *when* it should resurface.

```mermaid
flowchart LR
    L([A lesson])
    L --> Rule[Rule<br/>the thing to remember<br/>e.g. normalize paths to forward slashes]
    L --> Trig[Triggers<br/>WHEN to resurface it]
    Trig --> T1[file glob<br/>src/cli/*.ts<br/>most reliable]
    Trig --> T2[command pattern<br/>matches a shell command]
    Trig --> T3[keyword<br/>a task phrase]
```

Prefer a **file glob** trigger — it's the one Recall fires on most reliably. A lesson whose every trigger is dead on the file/command path could never be recalled, so capturing one is rejected (you'll be told why). A catch-all glob such as `**/*` is rejected too (`CATCH_ALL_GLOB`): a rule for every task is captured with `--scope always` instead.

## How it reaches every tool

You set it up once. `generate` then projects the same memory into every AI tool you use.

```mermaid
flowchart TD
    Init[agentsmesh init --lessons]
    Init --> G1[creates the empty graph<br/>+ a default config.json]
    Init --> G2[adds an always-on rule:<br/>recall before edits, capture after failures]
    Init --> G3[wires an auto-recall hook<br/>before and after each tool action]
    G1 --> Gen[agentsmesh generate]
    G2 --> Gen
    G3 --> Gen
    Gen --> Tools[Same memory now works in<br/>Claude - Cursor - Codex - Copilot - ...]
```

## A 30-second example

```bash
# 1. One-time setup
agentsmesh init --lessons && agentsmesh generate

# 2. You hit a bug: a Windows path broke because of a backslash.
#    Capture the lesson so it never bites again:
agentsmesh lessons add "Normalize CLI display paths to forward slashes" \
  --topic windows-paths \
  --new-topic --topic-summary "Cross-platform path handling" \
  --trigger-file "src/cli/*.ts"

# 3. Later, before editing a CLI file, the agent recalls it automatically:
agentsmesh lessons query --file src/cli/foo.ts
#   -> Normalize CLI display paths to forward slashes
```

The graph is a normal git-tracked file, so lessons are shared with your team and every change is reviewable and reversible.

## Where to go next

- **CLI reference** — every subcommand and flag: [`website/.../cli/lessons`](../../../website/src/content/docs/cli/lessons.mdx)
- **Concepts & guardrails** — ranking, dedup, capture guardrails, telemetry: [`website/.../reference/lessons`](../../../website/src/content/docs/reference/lessons.mdx)
- **Tuning** — `.agentsmesh/lessons/config.json` (`recallLimit`, `recallMaxTokens`, `autoPrune`); `init --lessons` writes it with sensible defaults.

## Under the hood (for contributors)

- Recall + capture entry points (migration-aware): `recallLessons` / `captureLesson` in `src/lessons/recall.ts`
- The canonical graph + transactional writes: `src/lessons/mutate.ts` (lock → load → mutate → validate → atomic save)
- Setup/scaffold: `scaffoldLessons` in `src/lessons/init.ts`
- Finding the project (nearest lessons folder, else `agentsmesh.yaml`, else git top level; never past `.git` or into home): `src/lessons/project-root.ts`
- One recall pipeline for the CLI, MCP and the hook (ranking, effectiveness, dedup, telemetry): `recallFromGraph` in `src/lessons/recall-core.ts`
- Capture error classes with stable `code`s: `src/lessons/add-errors.ts`; curation errors: `src/lessons/curation-errors.ts`; the CLI puts the code in the `--json` failure envelope
- Retiring a lesson settles the lessons merged into it (`deprecate`, `merge`): `src/lessons/retire-lineage.ts`
- The recall hook warns before staging an unmerged `lessons.json`: `src/lessons/hook-merge-guard.ts`
- Trigger matching + ranking: `src/lessons/query.ts`, `src/lessons/ranking.ts`
