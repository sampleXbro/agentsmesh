import { triggerHint } from './capture-trigger-hint.js';
import { commitSeen, openSessionDedup } from './seen-cache.js';

/**
 * Capture-on-failure nudge — the deterministic counterpart to recall.
 *
 * Recall fires via a hook so a lesson reaches the agent without depending on the
 * model choosing to run it; CAPTURE had no such trigger — it was 100% prose-gated
 * ("after a failure, run `lessons add`"). This closes that: a `PostToolUseFailure`
 * hook (NOT `PostToolUse`, which is success-only) fires exactly at the teachable
 * moment — a command/edit just failed — and injects an ADVISORY reminder to make
 * a capture decision, pre-filled with the failed file/command as a ready-to-paste
 * trigger. It never authors the lesson (single-party authorship is by design); it
 * only removes the "I forgot to consider capturing" failure mode.
 *
 * Two tiers, each firing at most ONCE per session (a nudge on every failure would
 * spam a TDD red-green loop). The generic tier reminds you to consider capturing;
 * the RECURRENCE tier is stronger — when the outcome log shows this same action
 * has failed before AND no lesson covers it, that is the clearest possible signal
 * a rule is missing, so it escalates with a pre-filled `lessons add`. Each tier has
 * its own reserved sentinel id, so a recurrence nudge cuts through even after the
 * generic one already fired; a sentinel can never collide with a real lesson id.
 */

/** Reserved seen-cache id marking "the generic capture nudge already fired this session". */
export const CAPTURE_NUDGE_SENTINEL = '__capture-nudge__';
/** Reserved seen-cache id for the stronger recurrence-driven capture nudge. */
export const CAPTURE_RECURRENCE_SENTINEL = '__capture-nudge-recurrence__';

/** A recorded failure escalates to the recurrence nudge from its second occurrence. */
export const RECURRENCE_THRESHOLD = 2;

export interface CaptureNudgeInput {
  /** Path of the file whose edit failed, if any (suggested project-relative). */
  readonly file?: string;
  /** Shell command that failed, if any. */
  readonly command?: string;
  /** Session correlator for the once-per-session guard. */
  readonly sessionId?: string;
  /** Project root — namespaces the once-per-session guard per project. */
  readonly projectRoot?: string;
  /** Times this action has failed (including now); >= 2 signals recurrence. */
  readonly failures?: number;
  /** True when an active lesson already matches this action — don't advise a NEW one. */
  readonly covered?: boolean;
  /** Coarse class of the recurring error, surfaced so the author writes a precise rule. */
  readonly lastErrorClass?: string;
}

/**
 * The single most common capture defect in field use: a lesson pinned to the file
 * where the bug was DISCOVERED never fires when the same general/library behavior
 * recurs elsewhere. Steer to the file-CLASS recurrence surface (see the
 * lessons-system trigger-scope lesson) — not the one file, and not a broad `src/**`.
 */
const RECURRENCE_SURFACE_HINT =
  '  Trigger where it will RECUR: for general/library behavior use the file-CLASS ' +
  "(a '**/.../*Name*.ts'-style glob), not just this one file — and not a broad 'src/**'.";

/** True when the log shows this action recurring with no lesson to prevent it. */
function isRecurringAndUncovered(input: CaptureNudgeInput): boolean {
  return (input.failures ?? 0) >= RECURRENCE_THRESHOLD && input.covered !== true;
}

/** The rule shape field reviewers single out as what makes a lesson worth reading. */
const RULE_SHAPE_HINT = '  Rule shape: cite the symptom, and say why the obvious fix is wrong.';

/** The pre-filled `lessons add` command + authoring hints, shared by both tiers. */
function addCommandBlock(input: CaptureNudgeInput): string {
  return `  agentsmesh lessons add "<imperative rule>" --topic <id> ${triggerHint(input)}\n${RECURRENCE_SURFACE_HINT}\n${RULE_SHAPE_HINT}`;
}

function genericNudge(input: CaptureNudgeInput): string {
  return (
    'A tool call just failed. If this surfaced a reusable rule (a wrong assumption, ' +
    'a non-obvious fix, a regression, or repeated friction), capture it now — otherwise ' +
    `continue:\n${addCommandBlock(input)}`
  );
}

function recurrenceNudge(input: CaptureNudgeInput): string {
  const errNote =
    input.lastErrorClass !== undefined ? ` The recurring error: «${input.lastErrorClass}».` : '';
  return (
    `This action has failed ${input.failures}× and no lesson covers it — capture the rule now so ` +
    `recall can prevent the next repeat:${errNote}\n${addCommandBlock(input)}`
  );
}

/**
 * Build the advisory capture-decision reminder, or `null` when this tier has
 * already fired this session (dedup). Pure except for the best-effort seen-cache
 * write. A recurring, uncovered failure escalates to the stronger recurrence tier.
 */
export function buildCaptureNudge(input: CaptureNudgeInput): string | null {
  const recurring = isRecurringAndUncovered(input);
  const sentinel = recurring ? CAPTURE_RECURRENCE_SENTINEL : CAPTURE_NUDGE_SENTINEL;
  const dedup = openSessionDedup({ explicit: input.sessionId, projectRoot: input.projectRoot });
  if (dedup !== null && dedup.seen.has(sentinel)) return null;
  const context = recurring ? recurrenceNudge(input) : genericNudge(input);
  if (dedup !== null) commitSeen(dedup, [sentinel]);
  return context;
}
