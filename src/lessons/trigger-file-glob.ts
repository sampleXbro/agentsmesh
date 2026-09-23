import { realpathSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parseGlob } from './glob-parse.js';
import { normalizeRecallFile } from './normalize-query-file.js';

/**
 * Recall matches `file_glob` triggers against project-relative, forward-slash
 * paths, so a captured glob is stored in that one form (`./src/a.ts` and
 * ` src/a.ts` become `src/a.ts`). A glob that could never fire is refused: one
 * outside the project, the project root itself, an existing folder (a folder
 * never matches a file), or one outside the safe glob subset.
 */

const ABSOLUTE = /^(?:[A-Za-z]:)?\//;
const GLOB_CHARS = /[*?[{]/;

const CODES = {
  outside: 'TRIGGER_FILE_OUTSIDE_PROJECT',
  root: 'TRIGGER_FILE_IS_PROJECT_ROOT',
  folder: 'TRIGGER_FILE_IS_DIRECTORY',
  unsafe: 'UNSAFE_GLOB_PATTERN',
} as const;

type GlobProblem = keyof typeof CODES;

function problemMessage(given: string, problem: GlobProblem, detail: string): string {
  switch (problem) {
    case 'outside':
      return (
        `--trigger-file ${given} points outside the project root. File triggers match ` +
        'project-relative paths, so it would never fire — pass a glob relative to the project ' +
        'root (e.g. "src/**/*.ts").'
      );
    case 'root':
      return (
        `--trigger-file ${given} is the project root itself, and file triggers match files. ` +
        'Pass a glob such as "src/**/*.ts".'
      );
    case 'folder':
      return (
        `--trigger-file ${given} is a folder, and file triggers match files. ` +
        `Use ${JSON.stringify(`${detail}/**`)} to match every file in it.`
      );
    case 'unsafe':
      return (
        `--trigger-file ${given} is outside the safe glob subset: ${detail}. ` +
        'Use only *, **, ?, [...] and {a,b}.'
      );
  }
}

/** Thrown when a `--trigger-file` glob could never fire. */
export class TriggerFileGlobError extends Error {
  readonly code: (typeof CODES)[GlobProblem];
  constructor(
    public readonly pattern: string,
    problem: GlobProblem = 'outside',
    detail = '',
  ) {
    super(problemMessage(JSON.stringify(pattern), problem, detail));
    this.name = 'TriggerFileGlobError';
    this.code = CODES[problem];
  }
}

/** True when both paths name the same folder, through any symlink (macOS /tmp is one). */
function sameFolder(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

function isFolder(projectRoot: string, path: string): boolean {
  if (GLOB_CHARS.test(path)) return false;
  return statSync(join(projectRoot, path), { throwIfNoEntry: false })?.isDirectory() === true;
}

/** Forward-slash, project-relative form of a file glob; throws when it could never fire. */
export function projectRelativeGlob(pattern: string, projectRoot: string): string {
  const forward = pattern.trim().replaceAll('\\', '/');
  let rel = forward;
  if (ABSOLUTE.test(forward)) {
    const root = projectRoot.replaceAll('\\', '/').replace(/\/+$/, '');
    rel =
      forward.startsWith(`${root}/`) || forward === root
        ? forward.slice(root.length + 1)
        : normalizeRecallFile(forward, projectRoot);
    if (ABSOLUTE.test(rel)) {
      throw new TriggerFileGlobError(
        pattern,
        sameFolder(forward, projectRoot) ? 'root' : 'outside',
      );
    }
  }
  const normalized = posix.normalize(rel === '' ? '.' : rel);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new TriggerFileGlobError(pattern, 'outside');
  }
  const path = normalized.replace(/\/+$/, '');
  if (path === '.' || path === '') throw new TriggerFileGlobError(pattern, 'root');
  if (path !== normalized || isFolder(projectRoot, path)) {
    throw new TriggerFileGlobError(pattern, 'folder', path);
  }
  const unsafe = parseGlob(path);
  if (typeof unsafe === 'string') throw new TriggerFileGlobError(pattern, 'unsafe', unsafe);
  return path;
}
