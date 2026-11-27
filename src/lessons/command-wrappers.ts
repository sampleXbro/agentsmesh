import { posix } from 'node:path';

/**
 * Words in front of the program a command really runs: `VAR=value` assignments
 * (the value may hold spaces, quotes or a `$(…)` substitution) and wrapper
 * programs such as `sudo -u www` or `env A=1`. Skipping them keys `sudo npm ci`
 * on `npm ci`, and keeps a flag or a fragment of a substitution from being
 * taken for the program.
 */

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** A program starts like a name or a path; a flag, an expansion or a quote does not. */
const PROGRAM_START = /^[A-Za-z0-9_./~\\[:]/;

interface WrapperSpec {
  /** Short flags that take the next word as their value. */
  readonly shortValue: string;
  readonly longValue: readonly string[];
  /** Leading flags after which the wrapper runs nothing (`command -v git` only looks up). */
  readonly inert?: readonly string[];
}

const NO_VALUE: WrapperSpec = { shortValue: '', longValue: [] };

const WRAPPERS: ReadonlyMap<string, WrapperSpec> = new Map([
  [
    'sudo',
    {
      shortValue: 'CDgpRrTtUu',
      longValue: [
        '--close-from',
        '--chdir',
        '--group',
        '--prompt',
        '--chroot',
        '--role',
        '--command-timeout',
        '--type',
        '--other-user',
        '--user',
      ],
    },
  ],
  ['env', { shortValue: 'CSu', longValue: ['--chdir', '--split-string', '--unset'] }],
  ['time', { shortValue: 'fo', longValue: ['--format', '--output'] }],
  ['nice', { shortValue: 'n', longValue: ['--adjustment'] }],
  ['nohup', NO_VALUE],
  ['command', { ...NO_VALUE, inert: ['-v', '-V'] }],
  ['exec', { shortValue: 'a', longValue: [] }],
]);

const isFlag = (word: string): boolean => /^-./.test(word);

/** True when `text` ends inside an open quote or an unclosed `(`. */
function endsOpen(text: string): boolean {
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote !== null) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '\\') i += 1;
    else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
  }
  return quote !== null || depth > 0;
}

/** Drop one assignment, plus the words its quoted or `$( )` value spreads over. */
function skipAssignment(words: readonly string[]): readonly string[] {
  let text = words[0] ?? '';
  let i = 1;
  while (endsOpen(text) && i < words.length) {
    text += ` ${words[i]}`;
    i += 1;
  }
  return words.slice(i);
}

/** Whether `flag` takes the next word as its value (`-u www`, `--user www`, `-Eu www`). */
function takesValue(flag: string, spec: WrapperSpec): boolean {
  if (flag.startsWith('--')) return !flag.includes('=') && spec.longValue.includes(flag);
  for (let i = 1; i < flag.length; i += 1) {
    // The first value flag of a bundle ends it; text glued after it is the value.
    if (spec.shortValue.includes(flag[i]!)) return i === flag.length - 1;
  }
  return false;
}

function skipFlags(words: readonly string[], spec: WrapperSpec): readonly string[] {
  let i = 0;
  while (i < words.length && isFlag(words[i]!)) {
    const flag = words[i]!;
    i += 1;
    if (flag === '--') break;
    if (takesValue(flag, spec)) i += 1;
  }
  return words.slice(i);
}

function wrapperSpec(word: string): WrapperSpec | undefined {
  return WRAPPERS.get(posix.basename(word.replaceAll('\\', '/')));
}

function isInert(args: readonly string[], spec: WrapperSpec): boolean {
  const end = args.findIndex((word) => !isFlag(word));
  const flags = end === -1 ? args : args.slice(0, end);
  return flags.some((flag) => spec.inert?.includes(flag) === true);
}

/** `words` without the leading assignments and wrapper programs (and their flags). */
export function unwrapWords(words: readonly string[]): string[] {
  let rest = words;
  for (;;) {
    const head = rest[0];
    if (head === undefined) return [];
    if (ASSIGNMENT.test(head)) {
      rest = skipAssignment(rest);
      continue;
    }
    const spec = wrapperSpec(head);
    if (spec === undefined || isInert(rest.slice(1), spec)) return [...rest];
    rest = skipFlags(rest.slice(1), spec);
  }
}

/** False for a flag, a `$` expansion or a quote: those are never the program. */
export function isUsableProgram(word: string): boolean {
  return PROGRAM_START.test(word);
}
