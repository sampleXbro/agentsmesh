import { buildCaptureNudge, RECURRENCE_THRESHOLD } from './capture-nudge.js';
import { contextKey } from './context-key.js';
import { errorClass } from './error-class.js';
import { contextOutput, EMPTY, type RecallHookResult } from './hook-emit.js';
import { failuresForContext, recordFailure } from './outcome-log.js';
import { hasCoveringLesson } from './recurrence-gate.js';

/** A failed tool call as the hook saw it. Split from hook.ts for the 200-line limit. */
export interface HookFailure {
  readonly event: string | undefined;
  readonly projectRoot: string;
  readonly sessionId: string | undefined;
  readonly file: string | undefined;
  readonly command: string | undefined;
  readonly errorText: string | undefined;
  /** The user stopped the tool; still nudged (it may be a correction), never recorded. */
  readonly interrupted?: boolean;
}

/**
 * Record a failed tool call and return the capture nudge. Only a real action
 * (file/command) can be attributed, recorded, and covered. An action-less
 * failure (a failed Read/Grep/MCP call → key 'none') still gets the generic
 * nudge, but is never recorded — it would fabricate cross-action recurrence.
 */
export function failureNudge(f: HookFailure): RecallHookResult {
  const { projectRoot, file, command, sessionId } = f;
  let failures = 0;
  let lastErrorClass: string | undefined;
  let covered = false;
  if ((file !== undefined || command !== undefined) && f.interrupted !== true) {
    const key = contextKey({ file, command }, projectRoot);
    // Record the failure so effectiveness can tell whether a lesson delivered for
    // this same action earlier actually prevented the repeat (EVALUATE).
    recordFailure(projectRoot, key, errorClass(f.errorText), process.env, sessionId);
    const history = failuresForContext(projectRoot, key);
    failures = history.count;
    lastErrorClass = history.lastErrorClass;
    // STORE: coverage only changes the nudge once the failure RECURS, so probe the
    // graph (a cheap raw match, no ranker/telemetry) only past the threshold.
    covered = failures >= RECURRENCE_THRESHOLD && hasCoveringLesson(projectRoot, file, command);
  }
  const context = buildCaptureNudge({
    file,
    command,
    sessionId,
    projectRoot,
    failures,
    covered,
    ...(lastErrorClass !== undefined ? { lastErrorClass } : {}),
  });
  return context === null ? EMPTY : contextOutput(f.event ?? 'PostToolUseFailure', context);
}
