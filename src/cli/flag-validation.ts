/**
 * Reject flags a command does not accept, so a typo (`--dryrun`) stops the run
 * instead of being dropped while the command writes for real. Accepted flags
 * come from the help table (plus the global flags), the same source the parser
 * uses, so `--help` and validation cannot disagree.
 */
import { CliUsageError } from './cli-error.js';
import { flagSpecs } from './flag-spec.js';
import { COMMANDS } from './help-data.js';

/** Commands that read or check their own flags. */
const SELF_VALIDATED = new Set(['lessons', 'mcp']);

/** Flags a handler rejects itself, with a message that names what to do instead. */
const HANDLER_CHECKED: Readonly<Record<string, readonly string[]>> = {
  generate: ['features'],
};

const normalize = (name: string): string => name.toLowerCase().replace(/[-_]/g, '');

/** Levenshtein edit distance (single row). */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** The accepted flag closest to `name`, or undefined when none is close. */
function closestFlag(name: string, accepted: Iterable<string>): string | undefined {
  const wanted = normalize(name);
  const maxDistance = Math.max(1, Math.min(2, Math.floor(wanted.length / 3)));
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of accepted) {
    const distance = editDistance(wanted, normalize(candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistance ? best : undefined;
}

/**
 * Message for the first flag `command` does not accept, or undefined when all
 * are fine. Commands outside the help table are not checked.
 */
export function unknownFlagMessage(
  command: string,
  flags: Readonly<Record<string, unknown>>,
): string | undefined {
  if (SELF_VALIDATED.has(command) || !COMMANDS.some((c) => c.name === command)) return undefined;
  const accepted = flagSpecs(command);
  const handled = HANDLER_CHECKED[command] ?? [];
  const unknown = Object.keys(flags).find((name) => !accepted.has(name) && !handled.includes(name));
  if (unknown === undefined) return undefined;
  const base = `Unknown flag --${unknown} for \`${command}\`.`;
  const suggestion = closestFlag(unknown, accepted.keys());
  return suggestion === undefined
    ? `${base} Run \`agentsmesh ${command} --help\` to see the accepted flags.`
    : `${base} Did you mean --${suggestion}?`;
}

/** Throws a usage error (exit code 2) naming the first flag the command does not accept. */
export function assertKnownFlags(command: string, flags: Readonly<Record<string, unknown>>): void {
  const message = unknownFlagMessage(command, flags);
  if (message !== undefined) throw new CliUsageError(message);
}
