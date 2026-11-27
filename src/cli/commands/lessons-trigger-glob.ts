import { posix } from 'node:path';
import { normalizeRecallFile } from '../../lessons/normalize-query-file.js';

const ABSOLUTE = /^(?:[A-Za-z]:)?\//;
const WILDCARD = /[*?[{]/;

/**
 * Read a `--trigger-file` glob typed in `cwd`, a folder below the project root,
 * like a shell does. Only the literal folder-and-file prefix is read (the part
 * before the first wildcard), with the rule recall `--file` uses: a prefix that
 * exists from the root keeps the root reading, else one that exists from `cwd`
 * moves onto `cwd`, and a path that exists nowhere (a file about to be created)
 * moves too unless only its root-side parent folder exists. A glob that starts
 * with a wildcard, an absolute glob, or one that would leave the project is
 * returned as typed. Returns the input itself when nothing moved.
 */
export function anchorTriggerGlob(glob: string, projectRoot: string, cwd: string): string {
  const typed = glob.trim().replaceAll('\\', '/');
  const negation = typed.startsWith('!') ? '!' : '';
  const body = typed.slice(negation.length);
  if (body === '' || ABSOLUTE.test(body)) return glob;
  const segments = body.split('/');
  if (segments.includes('')) return glob;

  const wildcard = segments.findIndex((segment) => WILDCARD.test(segment));
  const literal = wildcard === -1 ? segments.length : wildcard;
  if (literal === 0) return glob;
  const prefix = segments.slice(0, literal).join('/');
  const anchored = normalizeRecallFile(prefix, projectRoot, cwd);
  if (anchored === posix.normalize(prefix) || anchored.startsWith('../')) return glob;
  return `${negation}${[anchored, ...segments.slice(literal)].join('/')}`;
}
