/**
 * The text a harness reports when a tool call failed.
 *
 * Claude Code's PostToolUseFailure puts it in a top-level `error` string
 * ("Exit code 1\n…"); other harnesses send `tool_error` or a structured
 * `tool_response`. A SUCCESS payload also carries output (Bash `stdout` /
 * `stderr`), so response fields are read only when something marks the call as
 * failed — otherwise every successful command would be recorded as a failure.
 */

export interface FailurePayload {
  readonly hook_event_name?: unknown;
  readonly error?: unknown;
  readonly tool_error?: unknown;
  readonly tool_response?: unknown;
}

/** Response fields whose non-empty value is itself a failure signal. */
const ERROR_FIELDS = ['error', 'errorMessage'] as const;
/** Text fields of a failed response, most specific first. */
const TEXT_FIELDS = ['stderr', 'error', 'errorMessage', 'message', 'stdout'] as const;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstText(record: Record<string, unknown>, fields: readonly string[]): string | undefined {
  for (const field of fields) {
    const text = nonEmptyString(record[field]);
    if (text !== undefined) return text;
  }
  return undefined;
}

function isNonZero(code: unknown): boolean {
  return typeof code === 'number' && code !== 0;
}

/** is_error / isError, a non-zero exit code, a failure resultType, or an explicit error field. */
function responseSignalsFailure(response: Record<string, unknown>): boolean {
  return (
    response.is_error === true ||
    response.isError === true ||
    response.resultType === 'failure' ||
    isNonZero(response.exit_code) ||
    isNonZero(response.exitCode) ||
    firstText(response, ERROR_FIELDS) !== undefined
  );
}

/** Failure text from a hook payload, or `undefined` when it carries no failure. */
export function failureText(payload: FailurePayload): string | undefined {
  const explicit = nonEmptyString(payload.tool_error) ?? nonEmptyString(payload.error);
  if (explicit !== undefined) return explicit;
  const response = asRecord(payload.tool_response);
  const failed =
    payload.hook_event_name === 'PostToolUseFailure' ||
    (response !== undefined && responseSignalsFailure(response));
  if (!failed) return undefined;
  return (
    nonEmptyString(payload.tool_response) ??
    (response === undefined ? undefined : firstText(response, TEXT_FIELDS))
  );
}
