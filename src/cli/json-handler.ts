/**
 * JSON mode orchestration helper.
 * Decides whether to render human output or emit a JSON envelope.
 */

import { emitJson } from './json-output.js';

interface CommandOutput {
  exitCode: number;
  data: unknown;
  /** Actionable failure message; surfaced verbatim in the JSON envelope when present. */
  error?: string;
  /** Stable machine code of the failure; emitted in the failed envelope when present. */
  code?: string;
}

/**
 * Handles command result: emits JSON in json mode, otherwise renders and exits.
 */
export function handleResult(
  command: string,
  result: CommandOutput,
  flags: Record<string, string | boolean>,
  render: () => void,
): void {
  if (flags.json === true) {
    const success = result.exitCode === 0;
    // Prefer the command's own actionable message (e.g. "Recall needs a
    // predicate…"); fall back to a generic one only when none was provided.
    const error =
      result.error !== undefined && result.error.length > 0
        ? result.error
        : `Command '${command}' failed`;
    emitJson(
      command,
      success
        ? { success: true, data: result.data }
        : { success: false, error, code: result.code, data: result.data },
    );
    process.exit(result.exitCode);
    return; // unreachable at runtime; guards against mocked process.exit in tests
  }
  render();
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
