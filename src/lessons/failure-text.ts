/**
 * The text a harness reports when a tool call failed.
 *
 * Harnesses disagree on where it lives: some send a plain `tool_error` string,
 * Claude Code sends a structured `tool_response` whose shape depends on the
 * tool. The previous extractor accepted only a plain string, so every failure
 * this project recorded carried no error class at all — and a recurrence gate
 * built on a coarse action key plus no signature can only say "something in
 * this class failed", never "this problem happened again".
 *
 * Field names are tried in specificity order rather than enumerated per
 * harness, so a new harness that reports `stderr` or `message` works without a
 * change here.
 */

/** Conventional error-bearing fields, most specific first. */
const ERROR_FIELDS = ['stderr', 'error', 'errorMessage', 'message', 'stdout'] as const;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function fromRecord(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const field of ERROR_FIELDS) {
    const text = nonEmptyString(record[field]);
    if (text !== undefined) return text;
  }
  return undefined;
}

/** Failure text from a hook payload, or `undefined` when the harness sent none. */
export function failureText(payload: {
  readonly tool_error?: unknown;
  readonly tool_response?: unknown;
}): string | undefined {
  return (
    nonEmptyString(payload.tool_error) ??
    fromRecord(payload.tool_error) ??
    nonEmptyString(payload.tool_response) ??
    fromRecord(payload.tool_response)
  );
}
