import { posix, relative, resolve } from 'node:path';
import { LESSONS_GRAPH_PATH } from './graph-store.js';

/**
 * Does a shell command stage or commit files? The recall hook asks this before
 * it runs git, so only `git add` / `commit` / `<op> --continue` ever pay for a
 * git call. Matching is lexical and errs towards "yes" for paths and wildcards:
 * a false yes costs one git call and warns only if the graph is really unmerged.
 */

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const SHELL_WORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']);
const WRAPPERS = new Set(['time', 'exec', 'command', 'builtin', 'nohup']);
const CONTINUABLE = new Set(['merge', 'rebase', 'cherry-pick', 'revert']);
const GIT_VALUE_FLAGS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
]);
const STAGE_ALL_FLAGS = new Set(['--all', '--update', '--patch', '--interactive']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const MAX_SHELL_DEPTH = 2;

/** Words of each simple command: split on `;`, `&`, `|`, `(`, `)` and newlines outside quotes. */
function tokenize(text: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  let quote: string | null = null;
  const endWord = (): void => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = (): void => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote !== null) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < text.length) word += text[++i];
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (ch === '\\' && i + 1 < text.length) {
      const next = text[++i]!;
      if (next !== '\n') {
        word += next;
        inWord = true;
      }
    } else if (ch === '#' && !inWord) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i += 1;
    } else if (ch === '\n' || ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')') {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word += ch;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

/** Every prefix directory of a slash path, then the path itself. */
const prefixes = (path: string): string[] =>
  path.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'));

function wildcardMayMatch(pathspec: string, candidates: readonly string[]): boolean {
  try {
    const source = pathspec
      .replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const pattern = new RegExp(`^${source}$`);
    return candidates.some((c) => pattern.test(c));
  } catch {
    return true;
  }
}

function pathspecMayMatchGraph(raw: string, start: string, graphFile: string): boolean {
  const word = raw.replaceAll('\\', '/');
  if (word.startsWith(':')) return !/^:(?:[!^]|\([^)]*exclude)/.test(word);
  const graph = graphFile.replaceAll('\\', '/');
  const target = resolve(start, word).replaceAll('\\', '/').replace(/\/+$/, '');
  if (graph === target || graph.startsWith(`${target}/`)) return true;
  const rel = posix
    .normalize(word)
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '');
  // The command may have changed directory first, so also match against the project-relative path.
  if (rel === LESSONS_GRAPH_PATH) return true;
  if (LESSONS_GRAPH_PATH.startsWith(`${rel}/`) || LESSONS_GRAPH_PATH.endsWith(`/${rel}`))
    return true;
  if (rel.endsWith(`/${LESSONS_GRAPH_PATH}`)) return true;
  if (!/[*?[]/.test(rel)) return false;
  const fromStart = relative(start, graphFile).replaceAll('\\', '/');
  return wildcardMayMatch(rel, [...prefixes(fromStart), ...prefixes(LESSONS_GRAPH_PATH)]);
}

function addMayStageGraph(args: readonly string[], start: string, graphFile: string): boolean {
  const paths: string[] = [];
  let literal = false;
  for (const arg of args) {
    if (literal || !arg.startsWith('-') || arg === '-') {
      paths.push(arg);
    } else if (arg === '--') {
      literal = true;
    } else if (arg.startsWith('--')) {
      const name = arg.split('=')[0]!;
      if (STAGE_ALL_FLAGS.has(name) || name === '--pathspec-from-file') return true;
    } else if (/[Aupi]/.test(arg)) {
      return true;
    }
  }
  return paths.some((p) => pathspecMayMatchGraph(p, start, graphFile));
}

/** The words after `git` and its global options: the subcommand and its arguments. */
function gitArguments(words: readonly string[]): string[] {
  let i = 0;
  while (i < words.length && words[i]!.startsWith('-')) {
    const flag = words[i]!;
    i += GIT_VALUE_FLAGS.has(flag) ? 2 : 1;
  }
  return words.slice(i);
}

/** Skip env assignments, shell keywords and wrappers before the program. */
function programWords(words: readonly string[]): string[] {
  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    if (ASSIGNMENT.test(w) || SHELL_WORDS.has(w) || WRAPPERS.has(w)) i += 1;
    else break;
  }
  return words.slice(i);
}

function commandMayStage(
  words: readonly string[],
  start: string,
  graphFile: string,
  depth: number,
): boolean {
  const [program, ...rest] = programWords(words);
  if (program === undefined) return false;
  const name = posix.basename(program.replaceAll('\\', '/')).replace(/\.exe$/i, '');
  if (SHELLS.has(name)) {
    const c = rest.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w));
    const script = c < 0 ? undefined : rest[c + 1];
    return (
      script !== undefined && depth < MAX_SHELL_DEPTH && scan(script, start, graphFile, depth + 1)
    );
  }
  if (name !== 'git') return false;
  const [sub, ...args] = gitArguments(rest);
  if (sub === 'commit') return true;
  if (sub === 'add' || sub === 'stage') return addMayStageGraph(args, start, graphFile);
  return sub !== undefined && CONTINUABLE.has(sub) && args.includes('--continue');
}

function scan(command: string, start: string, graphFile: string, depth: number): boolean {
  return tokenize(command).some((words) => commandMayStage(words, start, graphFile, depth));
}

/**
 * True when `command` (a compound shell command is fine) runs `git add` that can
 * reach the graph file, `git commit` in any form, or `git merge|rebase|cherry-pick|
 * revert --continue`. `start` is the directory the command runs from.
 */
export function mayStageLessonsGraph(command: string, start: string, graphFile: string): boolean {
  return scan(command, start, graphFile, 0);
}
