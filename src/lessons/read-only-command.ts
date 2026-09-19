/**
 * Is a shell command purely a read?
 *
 * The lessons ritual has always exempted pure-read commands in its own rule
 * text, but the hook path never implemented the exemption, so a `grep` exiting
 * 1 on no match recorded a failure and a `cat` of a missing path counted toward
 * recurrence. The result was a "RECURRENT FAILURE" banner on commands that
 * cannot fail destructively.
 *
 * The classifier is deliberately conservative — allowlisted programs only, and
 * any sign of writing disqualifies the whole command. A false negative just
 * restores the previous behaviour; a false positive would swallow a real
 * failure, so unknown programs are always treated as state-changing.
 */

/** Programs that only read. Anything absent is state-changing by default. */
const READ_ONLY_PROGRAMS = new Set([
  'awk',
  'basename',
  'cat',
  'cksum',
  'column',
  'comm',
  'cut',
  'diff',
  'dirname',
  'du',
  'echo',
  'env',
  'file',
  'find',
  'fgrep',
  'grep',
  'head',
  'jq',
  'less',
  'ls',
  'md5sum',
  'more',
  'nl',
  'od',
  'printf',
  'pwd',
  'readlink',
  'realpath',
  'rg',
  'sed',
  'shasum',
  'sort',
  'stat',
  'tail',
  'tr',
  'tree',
  'type',
  'uniq',
  'wc',
  'which',
  'whoami',
  'yq',
]);

/** `git` subcommands that only read. `git` with anything else is state-changing. */
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'blame',
  'cat-file',
  'describe',
  'diff',
  'grep',
  'log',
  'ls-files',
  'ls-remote',
  'ls-tree',
  'rev-list',
  'rev-parse',
  'shortlog',
  'show',
  'show-ref',
  'status',
]);

/**
 * Flags that turn an otherwise read-only program into a writing one:
 * `sed -i` edits in place, `find -delete` removes, `find -exec` runs anything.
 */
const WRITING_FLAGS = new Set(['-i', '--in-place', '-delete', '-exec', '-execdir', '-ok']);

/** Segments run independently, so every one of them has to be a read. */
function splitSegments(command: string): string[] {
  return command.split(/\|\||&&|[;|]/).map((part) => part.trim());
}

/**
 * Writing redirection. `2>/dev/null` and `2>&1` only silence a stream, so they
 * stay read-only; a redirect to a path does not.
 */
function redirectsToPath(segment: string): boolean {
  const withoutStderr = segment.replace(/2>&1/g, ' ').replace(/[12&]?>\s*\/dev\/null/g, ' ');
  return /[^0-9a-zA-Z_]>>?/.test(` ${withoutStderr}`);
}

function isReadOnlySegment(segment: string): boolean {
  if (segment.length === 0) return false;
  if (redirectsToPath(segment)) return false;

  const words = segment.split(/\s+/).filter((w) => w.length > 0);
  // Leading `VAR=val` assignments do not change what the program does.
  let start = 0;
  while (start < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start]!)) start += 1;
  const rest = words.slice(start);
  const program = rest[0];
  if (program === undefined) return false;
  // A path-shaped program (`./run.sh`) is never allowlisted.
  if (program.includes('/')) return false;
  if (rest.some((w) => WRITING_FLAGS.has(w))) return false;

  if (program === 'git') {
    const sub = rest.slice(1).find((w) => !w.startsWith('-'));
    return sub !== undefined && READ_ONLY_GIT_SUBCOMMANDS.has(sub);
  }
  return READ_ONLY_PROGRAMS.has(program);
}

/** True only when every segment of `command` is a pure read. */
export function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed.length === 0) return false;
  const segments = splitSegments(trimmed);
  return segments.length > 0 && segments.every(isReadOnlySegment);
}
