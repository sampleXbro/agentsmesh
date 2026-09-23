import { normalizeRecallFile } from './normalize-query-file.js';

/**
 * Recall matches `file_glob` triggers against project-relative paths, so an
 * absolute glob is captured and then never fires. An absolute glob inside the
 * project is made relative; one outside it is rejected.
 */

const ABSOLUTE = /^(?:[A-Za-z]:)?\//;

/** Thrown when a `--trigger-file` glob is absolute and outside the project root. */
export class TriggerFileGlobError extends Error {
  readonly code = 'TRIGGER_FILE_OUTSIDE_PROJECT';
  constructor(public readonly pattern: string) {
    super(
      `--trigger-file ${JSON.stringify(pattern)} is an absolute path outside the project root. ` +
        'File triggers match project-relative paths, so it would never fire — pass a glob ' +
        'relative to the project root (e.g. "src/**/*.ts").',
    );
    this.name = 'TriggerFileGlobError';
  }
}

/** Forward-slash, project-relative form of a file glob; throws when it cannot be one. */
export function projectRelativeGlob(pattern: string, projectRoot: string): string {
  const forward = pattern.replaceAll('\\', '/');
  if (!ABSOLUTE.test(forward)) return forward;
  const root = projectRoot.replaceAll('\\', '/').replace(/\/+$/, '');
  const rel = forward.startsWith(`${root}/`)
    ? forward.slice(root.length + 1)
    : normalizeRecallFile(forward, projectRoot);
  if (rel.length === 0 || ABSOLUTE.test(rel) || rel === '..' || rel.startsWith('../')) {
    throw new TriggerFileGlobError(pattern);
  }
  return rel;
}
