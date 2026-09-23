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
 * documented there must be known here), so the two can never drift. The same
 * signature also marks the repeatable flags (`[--flag <v>]...`) and the
 * positional arguments (`<id>`), so a repeated single-value flag or an extra
 * positional (an unquoted multi-word rule) is an error, not silently dropped.
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

/** Flags marked repeatable (`[--flag <value>]...`) in the subcommand's usage signature. */
export function repeatableLessonsFlags(subcommand: string): readonly string[] {
  const usage = LESSONS_USAGE[subcommand]?.usage ?? '';
  const names = [...usage.matchAll(/\[--([a-z-]+)[^\]]*\]\.\.\./g)].map((m) => m[1]);
  return names.filter((name): name is string => name !== undefined);
}

/** Value flags a handler reads that the usage signature does not list. */
const VALUE_FLAG_ALIASES: Record<string, readonly string[]> = { query: ['command'], add: ['rule'] };

/** Flags that take a value: `--flag <v>` in the usage signature, plus aliases. */
export function lessonsValueFlags(subcommand: string): readonly string[] {
  const usage = LESSONS_USAGE[subcommand]?.usage ?? '';
  const names = [...usage.matchAll(/--([a-z-]+) (?!-)[^\s\]]/g)].map((m) => m[1]);
  return [
    ...names.filter((name): name is string => name !== undefined),
    ...(VALUE_FLAG_ALIASES[subcommand] ?? []),
  ];
}

function missingValue(value: string | boolean | string[]): boolean {
  const values = Array.isArray(value) ? value : [value];
  // Blank text is a value (a " " trigger gets its own "too broad" error).
  return values.some((v) => v === true || v === '');
}

function unknownFlag(subcommand: string, name: string): string {
  // `add "--no-verify is forbidden"` parses as a flag; say how to pass it.
  const joined = subcommand === 'add' ? 'rule' : '<flag>';
  const hint = /\s/.test(name)
    ? ` To pass text that starts with --, join it to its flag with =, e.g. --${joined}="--${name}".`
    : '';
  return `Unknown flag --${name} for \`lessons ${subcommand}\`.${hint}\n${usageLine(subcommand)}`;
}

/**
 * Positional arguments `subcommand` takes: the `<placeholder>` tokens before the
 * first flag in its usage signature. Undefined for internal subcommands.
 */
export function lessonsPositionalLimit(subcommand: string): number | undefined {
  const usage = LESSONS_USAGE[subcommand]?.usage;
  if (usage === undefined) return undefined;
  const tokens = usage
    .slice(`agentsmesh lessons ${subcommand}`.length)
    .split(' ')
    .filter((t) => t.length > 0);
  const firstNonPositional = tokens.findIndex((t) => !/^"?</.test(t));
  return firstNonPositional === -1 ? tokens.length : firstNonPositional;
}

function usageLine(subcommand: string): string {
  // Every key in LESSONS_KNOWN_FLAGS is also a LESSONS_USAGE key (parity test).
  return `Usage: ${LESSONS_USAGE[subcommand]!.usage}`;
}

/**
 * Return an error naming the first unknown or repeated single-value flag for
 * `subcommand`, or null when every passed flag is fine. Internal subcommands
 * (`hook`, `merge-driver`) and any subcommand absent from the map are not
 * validated — they are machine-invoked and take no human flags.
 */
export function validateLessonsFlags(subcommand: string, flags: LessonsFlags): string | null {
  const known = LESSONS_KNOWN_FLAGS[subcommand];
  if (known === undefined) return null;
  const allowed = new Set<string>([...known, ...GLOBAL_FLAGS]);
  const repeatable = new Set(repeatableLessonsFlags(subcommand));
  const valueFlags = new Set(lessonsValueFlags(subcommand));
  for (const [name, value] of Object.entries(flags)) {
    if (!allowed.has(name)) return unknownFlag(subcommand, name);
    if (valueFlags.has(name) && missingValue(value)) {
      return (
        `--${name} needs a value. To pass a value that starts with --, write --${name}=<value>.` +
        `\n${usageLine(subcommand)}`
      );
    }
    if (Array.isArray(value) && !repeatable.has(name)) {
      return `--${name} was given ${value.length} times; pass it once.\n${usageLine(subcommand)}`;
    }
  }
  return null;
}

/** Error naming the positionals past the subcommand's limit, or null. */
export function validateLessonsPositionals(
  subcommand: string,
  positionals: readonly string[],
): string | null {
  const limit = lessonsPositionalLimit(subcommand);
  if (limit === undefined || positionals.length <= limit) return null;
  const takes =
    limit === 0
      ? 'takes no positional arguments.'
      : `takes ${limit} positional argument${limit === 1 ? '' : 's'}; quote a multi-word value.`;
  const extra = positionals.slice(limit).join(' ');
  return `Unexpected extra argument(s): ${extra} — \`lessons ${subcommand}\` ${takes}\n${usageLine(subcommand)}`;
}
