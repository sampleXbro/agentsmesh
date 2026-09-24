import { commandClass } from './command-class.js';
import { normalizeRecallFile } from './normalize-query-file.js';

/**
 * A `contextKey` binds an outcome (a lesson delivered, or a failure observed) to
 * the concrete ACTION about to happen — the file being edited or the command
 * class being run. A delivery and a later failure on the SAME action share this
 * key, which is how effectiveness attributes a recurrence to the lesson meant to
 * prevent it. It is the action ONLY — the error class is recorded separately and
 * is never folded in here, because the `delivered` event is emitted before any
 * error exists, so an error-bearing key could never match its later `failure`.
 */

/**
 * A shell command as its stable class — program plus optional subcommand — so
 * outcomes bind to the action, not its arguments (see command-class.ts):
 *   "git commit -m 'wip'" → "git commit";  "cd /r && pnpm tsc" → "pnpm tsc".
 * '' when the command runs no program (`FOO=bar`).
 */
export function normalizeCommand(command: string): string {
  const cls = commandClass(command);
  if (cls === null) return '';
  return cls.subcommand === undefined ? cls.program : `${cls.program} ${cls.subcommand}`;
}

/** Deterministic action key. File takes precedence (the tighter signal). Never raw text. */
export function contextKey(
  input: { file?: string; command?: string },
  projectRoot: string,
): string {
  if (input.file !== undefined && input.file.length > 0) {
    return `file:${normalizeRecallFile(input.file, projectRoot)}`;
  }
  if (input.command !== undefined && input.command.length > 0) {
    return `cmd:${normalizeCommand(input.command)}`;
  }
  return 'none';
}
