/**
 * Reduce a shell command to the program it really runs plus an optional
 * subcommand — the stable CLASS outcomes and command triggers bind to.
 *
 * A compound command is split on `&&`, `||`, `;`, `|` and newlines (outside
 * quotes); segments that only navigate or set up the shell (`cd`, `export`,
 * `set`, comments, loop headers) are skipped, so `cd /repo && pnpm tsc` keys as
 * `pnpm tsc`, not `cd`. For programs with known global flags, those flags (and
 * their values) are skipped before the subcommand: `git -C app commit` →
 * `git commit`. Other programs keep the operand rule: past a flag, a bare word
 * is an argument (`rm -rf build` → `rm`).
 */

export interface CommandClass {
  readonly program: string;
  readonly subcommand?: string;
  /** True when global flags sat between program and subcommand (`git -C x commit`). */
  readonly gapped: boolean;
}

/** Value-taking global flags of programs whose first plain word is a subcommand. */
const GLOBAL_VALUE_FLAGS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    'git',
    ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'],
  ],
  ['npm', ['--prefix', '-w', '--workspace', '--userconfig', '--cache', '--loglevel']],
  ['pnpm', ['-C', '--dir', '-F', '--filter', '--loglevel', '--reporter']],
  ['yarn', ['--cwd']],
  ['npx', ['-p', '--package', '-c', '--call']],
  ['bun', ['--cwd', '--config']],
  ['bunx', ['-p', '--package']],
  ['make', ['-C', '--directory', '-f', '--file', '--makefile', '-I', '--include-dir']],
  ['docker', ['-H', '--host', '--context', '-c', '--config', '-l', '--log-level']],
  [
    'kubectl',
    ['-n', '--namespace', '--context', '--kubeconfig', '--cluster', '--user', '-s', '--server'],
  ],
  ['cargo', ['-C', '--config', '-Z', '--color']],
  ['go', ['-C']],
]);

/** Programs that only move around or set up the shell — never the action itself. */
const SHELL_SETUP = new Set([
  'cd',
  'pushd',
  'popd',
  'export',
  'set',
  'unset',
  'source',
  '.',
  '[',
  '[[',
  'test',
  'true',
  'false',
  ':',
]);
/** Leading shell keywords stripped before the program. */
const SHELL_PREFIX = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', 'time']);
/** Segments that are shell block syntax, not a command. */
const BLOCK_SYNTAX = new Set(['for', 'case', 'select', 'function', 'done', 'fi', 'esac']);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SUBCOMMAND = /^[A-Za-z][A-Za-z0-9_-]*(?::[A-Za-z0-9_-]+)*$/;

/** Split on `&&`, `||`, `;`, `|`, `|&` and newlines outside quotes. */
function splitSegments(command: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!;
    const next = command[i + 1];
    if (quote !== null) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      cur += ch;
    } else if (ch === '\\' && next !== undefined) {
      cur += ch + next;
      i += 1;
    } else if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && next === '&')) {
      out.push(cur);
      cur = '';
      if (ch !== ';' && ch !== '\n' && (next === ch || next === '&')) i += 1;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** `node_modules/.bin/vitest` → `vitest`; a plain name is kept. */
function programName(word: string): string {
  const parts = word.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || word;
}

function subcommandOf(program: string, args: readonly string[]): Omit<CommandClass, 'program'> {
  const valueFlags = GLOBAL_VALUE_FLAGS.get(program);
  let i = 0;
  while (valueFlags !== undefined && i < args.length && /^-./.test(args[i]!)) {
    const flag = args[i]!;
    i += flag !== '--' && !flag.includes('=') && valueFlags.includes(flag) ? 2 : 1;
    if (flag === '--') break;
  }
  const next = args[i];
  return next !== undefined && SUBCOMMAND.test(next)
    ? { subcommand: next, gapped: i > 0 }
    : { gapped: false };
}

function segmentClass(segment: string): CommandClass | null {
  const words = segment
    .replace(/^[\s({]+/, '')
    .replace(/[\s)}]+$/, '')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  while (words.length > 0 && SHELL_PREFIX.has(words[0]!)) words.shift();
  const first = words[0];
  if (first === undefined || first.startsWith('#') || BLOCK_SYNTAX.has(first)) return null;
  while (words.length > 0 && ASSIGNMENT.test(words[0]!)) words.shift();
  if (words.length === 0) return null;
  const program = programName(words[0]!);
  return { program, ...subcommandOf(program, words.slice(1)) };
}

/** The class of the first segment that runs a real program, else of the first setup step. */
export function commandClass(command: string): CommandClass | null {
  let setup: CommandClass | null = null;
  for (const segment of splitSegments(command.replace(/\\\r?\n/g, ' '))) {
    const cls = segmentClass(segment);
    if (cls === null) continue;
    if (!SHELL_SETUP.has(cls.program)) return cls;
    setup ??= { program: cls.program, gapped: false };
  }
  return setup;
}
