import { commandClass, type CommandClass } from './command-class.js';
import { normalizeRecallFile } from './normalize-query-file.js';

/**
 * The ready-to-paste trigger flag in a capture nudge, pre-filled from the failed
 * file/command — a STARTING point, not the answer.
 *
 * The file is suggested project-relative: recall matches globs against
 * project-relative paths, so an absolute suggestion would be captured and then
 * never fire. The command hint is CONCRETE (authors skip a fill-in-the-regex
 * placeholder): the failed command's class, word-bounded, and when global flags
 * sat before the subcommand (`git -C x commit`) the pattern allows them, so the
 * suggested trigger matches the command that just failed.
 */

const FILE_PLACEHOLDER = "--trigger-file '<glob>'";
const CMD_PLACEHOLDER = "--trigger-cmd '<regex matching the command>'";
/** Quotes, controls, line separators and format characters break or hide the pasted line. */
const UNSAFE = /['\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** Escape a literal string for use inside a command_pattern regex. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-bounded literal: an unanchored `rm` would fire on `pnpm run format`. */
function bounded(literal: string): string {
  const lead = /^\w/.test(literal) ? '\\b' : '';
  const tail = /\w$/.test(literal) ? '\\b' : '';
  return `${lead}${escapeRegex(literal)}${tail}`;
}

function classPattern(cls: CommandClass): string {
  if (cls.subcommand === undefined) return bounded(cls.program);
  if (cls.gapped) return `${bounded(cls.program)}.*${bounded(cls.subcommand)}`;
  return bounded(`${cls.program} ${cls.subcommand}`);
}

function fileHint(file: string, projectRoot: string | undefined): string {
  const rel =
    projectRoot === undefined ? file.replaceAll('\\', '/') : normalizeRecallFile(file, projectRoot);
  const unusable = /^(?:[A-Za-z]:)?\//.test(rel) || rel.startsWith('../') || UNSAFE.test(rel);
  return unusable ? FILE_PLACEHOLDER : `--trigger-file '${rel}'`;
}

export interface TriggerHintInput {
  readonly file?: string;
  readonly command?: string;
  readonly projectRoot?: string;
}

export function triggerHint(input: TriggerHintInput): string {
  if (input.file !== undefined) return fileHint(input.file, input.projectRoot);
  if (input.command === undefined) return FILE_PLACEHOLDER;
  const cls = commandClass(input.command);
  const pattern = cls === null ? null : classPattern(cls);
  return pattern === null || UNSAFE.test(pattern) ? CMD_PLACEHOLDER : `--trigger-cmd '${pattern}'`;
}
