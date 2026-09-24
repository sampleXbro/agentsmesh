import { serializeFrontmatter } from '../utils/text/markdown.js';

/**
 * Tier 2 of the lessons contract: the on-demand operating manual.
 *
 * The always-on trigger lives in the root instruction (`LESSONS_PROCEDURAL_RULE`,
 * injected into `.agentsmesh/rules/_root.md`). That block is deliberately minimal
 * — it carries only the binding essentials. This skill holds the rest: the Iron
 * Law gates, the rationalization table, and the capture how-to. It is kept short
 * on purpose — full command/flag reference lives in `agentsmesh lessons --help`,
 * not here (skill best practice: move details to tool help).
 *
 * Borrowed from the superpowers pattern (minimal always-on bootstrap + a
 * progressive-disclosure skill manual, plus its rigid "Iron Law" gate framing),
 * but realized with agentsmesh's NATIVE primitives: the trigger rides canonical
 * rules (native on every target) and the manual rides a canonical skill (native
 * on every skill-supporting target), rather than a SessionStart hook (not a
 * canonical event; unsupported on most targets). A target without skills still
 * gets the trigger — graceful fallback.
 */
export const LESSONS_SKILL_NAME = 'lessons';

// Skill best practice (superpowers writing-skills / Anthropic): the description
// is the DISCOVERY signal — third-person, "Use when…", TRIGGERS ONLY, short, and
// NEVER a workflow summary (a summarized workflow makes the agent follow the
// description instead of reading the body). The two triggers below ARE the recall
// moment (about to mutate) and the capture moment (after a failure), so the skill
// self-surfaces as the fallback for the always-on rule. Subcommands live in the body.
export const LESSONS_SKILL_DESCRIPTION =
  'Use when about to edit a file or run a state-changing command, or after any ' +
  'failure, correction, or surprising result.';

export const LESSONS_SKILL_BODY = `# Lessons — operating manual (Iron Law)

## The Iron Law

**NO MUTATION WITHOUT RECALL. NO COMPLETION WITHOUT A CAPTURE DECISION.**

Violating the letter is violating the spirit. Edited a file or ran a state-changing
command without recall? Process violation. Did the turn hit a failure / correction /
regression / wrong assumption / surprise and you have not captured (nor stated
\`Lesson: none\`)? The task is INCOMPLETE — and the user will check. The graph
\`.agentsmesh/lessons/lessons.json\` is canonical — never hand-edit.

## Recall — before each edit/command, and at task start

\`agentsmesh lessons query --file <path> --cmd <command> --session auto\`, then apply every
rule. Pure-read commands (read-only) and the query itself are exempt. **keyword-only recall
for a specific edit is the anti-pattern** — anchor those to \`--file\`/\`--cmd\`. But at the
START of a task (or when planning), run \`agentsmesh lessons query --keyword "<the task's
key terms>" --always --session auto\`: that surfaces the conceptual rules no file/command
names PLUS the universal always-on lessons — the manual equivalent of the automatic prompt
recall on hook-capable tools. **Always pass \`--session auto\`**: it suppresses rules already
shown this session so repeat recalls stay quiet (without it every recall re-delivers the
whole matched set); \`--no-dedup\` re-shows everything after a context reset. Author a
\`keyword\` trigger beside a \`file_glob\` on conceptual lessons so they are reachable both
ways. No shell → MCP \`lessons_query\` (\`file\`/\`command\`/\`keyword\`/\`always\`; session dedup
is on by default there — \`no_dedup:true\` to re-show).

## Capture — Gate Function (before any completion claim)

1. **SELF-CRITIQUE**: any failure, correction, regression, wrong assumption,
   useful surprise, repeated friction, or non-obvious fix? Failing
   tests/lint/typecheck and user/review corrections — yours or anyone's — all count.
   PROCESS/TOOLING surprises count too (a sandbox command that silently no-op'd, a port
   already in use, a library's argument shape) — trigger those with \`--trigger-cmd\`. So
   does a review finding you REVIEWED then deliberately REJECTED: capture it as a "do NOT
   refactor" guard so the reasoning survives the session.
2. **CAPTURE** a reusable imperative rule with an effective trigger (else say so):
   \`agentsmesh lessons add "<rule>" --topic <id> --trigger-file <glob>\`. Trigger on the
   file-CLASS where it will RECUR (e.g. \`**/lib/use*Form*.ts\`), NOT the single file you
   discovered it in — and NOT a broad \`src/**\`. If the rule is a UNIVERSAL standard that
   applies to EVERY task (a comment/test/style convention no file or command names),
   capture it with \`--scope always\` instead — it needs no trigger and is delivered on
   every task.
3. **RECEIPT**: emit \`Lesson: captured <id>\` or \`Lesson: none\`.

At least one _effective_ trigger is required (or \`--scope always\` for a universal rule) or
the capture is rejected (\`UNRECALLABLE_LESSON\`); prefer \`--trigger-file\`. No shell → MCP \`lessons_query\`,
\`lessons_add\`, \`lessons_topics\`, \`lessons_show\`, \`lessons_deprecate\`. Run
\`agentsmesh lessons --help\` for every subcommand and flag: query, add, topics, show,
deprecate, merge, untrigger, strip-markers, prune, journal, validate, resolve, stats, import-md.
A git merge conflict in \`lessons.json\` → run \`agentsmesh lessons resolve\`; never hand-edit it.

### Rationalization Prevention — these excuses mean STOP

| Excuse | Reality |
| --- | --- |
| "Small edit / I already know this / later" | Query first — skipping recall is a process violation |
| "Nothing reusable here" | You hit a failure/surprise — name it or capture it |
| "My own TDD red, not a real failure" | A red you did not predict IS a lesson |
| "I fixed one site; the twin is obvious" | Capture it — the unfixed twin is what gets missed |
| "Different words, so the rule doesn't apply" | Spirit over letter |

## Lesson gate — before final response

The final response MUST carry the receipt: \`Lesson: captured <id>\` or \`Lesson: none\`.
No receipt = task incomplete. Do not capture one-off facts, task summaries, or project
context — only reusable imperative rules with an effective trigger.`;

/** Serialized canonical \`SKILL.md\` content for the lessons manual. */
export const LESSONS_SKILL_FILE = serializeFrontmatter(
  { name: LESSONS_SKILL_NAME, description: LESSONS_SKILL_DESCRIPTION },
  LESSONS_SKILL_BODY,
);
