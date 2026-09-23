/**
 * Per-subcommand known-flag allowlists for `agentsmesh lessons`.
 *
 * The CLI parser is permissive — an unrecognized `--flag` is parsed into the
 * flags record and then silently ignored by the handler. For lessons that is a
 * data-loss trap: a typoed `--trigger-flie` drops a trigger from a captured
 * lesson, and a typoed `--fil` makes recall look empty. So every user-facing
 * subcommand validates its flags against the set below and rejects unknowns
 * with the correct usage, rather than acting on a partial command.
 *
 * A parity test ties each list to the `LESSONS_USAGE` signature (every `--flag`
 * documented there must be known here), so the two can never drift.
 */
import { LESSONS_USAGE } from './lessons-usage.js';
import type { LessonsFlags } from './lessons-helpers.js';

/** Global flags accepted on every command (handled by the parser / json layer). */
export const GLOBAL_FLAGS: readonly string[] = ['json', 'verbose', 'help'];

/**
 * Subcommand → its accepted flag names (without the `--`). Subcommands that take
 * only positional args map to an empty list. `query` lists `command` as an alias
 * of `cmd` (the handler reads both); the documented spelling stays `--cmd`.
 */
export const LESSONS_KNOWN_FLAGS: Record<string, readonly string[]> = {
  query: [
    'file',
    'cmd',
    'command',
    'keyword',
    'always',
    'format',
    'top',
    'all',
    'max-tokens',
    'session',
    'no-dedup',
    'ids',
  ],
  add: [
    'rule',
    'topic',
    'trigger-file',
    'trigger-cmd',
    'trigger-kw',
    'evidence',
    'rationale',
    'new-topic',
    'topic-summary',
    'scope',
  ],
  topics: [],
  show: [],
  deprecate: ['superseded-by'],
  merge: [],
  untrigger: [],
  'strip-markers': ['dry-run'],
  journal: [],
  validate: [],
  resolve: [],
  stats: ['json'],
  prune: ['apply', 'cap'],
  'import-md': ['merge', 'force', 'migrated-at'],
};

/**
 * Return an error message naming the first unknown flag for `subcommand`, or
 * null when every passed flag is known. Internal subcommands (`hook`,
 * `merge-driver`) and any subcommand absent from the map are not validated —
 * they are machine-invoked and take no human flags.
 */
export function validateLessonsFlags(subcommand: string, flags: LessonsFlags): string | null {
  const known = LESSONS_KNOWN_FLAGS[subcommand];
  if (known === undefined) return null;
  const allowed = new Set<string>([...known, ...GLOBAL_FLAGS]);
  for (const name of Object.keys(flags)) {
    if (allowed.has(name)) continue;
    // Every key in LESSONS_KNOWN_FLAGS is also a LESSONS_USAGE key (the parity
    // test enforces it), so the signature is always present here.
    return `Unknown flag --${name} for \`lessons ${subcommand}\`.\nUsage: ${LESSONS_USAGE[subcommand]!.usage}`;
  }
  return null;
}
