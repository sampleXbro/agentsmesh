import { readFileSync, writeFileSync } from 'node:fs';
import { runGit, type GitRunner } from './git-exec.js';

const OURS_LABEL = 'this branch';
const BASE_LABEL = 'common ancestor';
const THEIRS_LABEL = 'incoming branch';

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const withNewline = (text: string): string =>
  text === '' || text.endsWith('\n') ? text : `${text}\n`;

/** One conflict block holding both whole files; used when git itself cannot merge. */
export function wholeFileConflict(ours: string, theirs: string): string {
  return (
    `<<<<<<< ${OURS_LABEL}\n${withNewline(ours)}=======\n` +
    `${withNewline(theirs)}>>>>>>> ${THEIRS_LABEL}\n`
  );
}

/**
 * Write git's line-based three-way merge into `oursPath`, with conflict markers
 * where the sides clash. A merge driver that exits non-zero must never leave
 * `ours` as it was: git would then treat it as the resolution and `git add`
 * would drop the other branch.
 */
export function writeTextualMerge(
  basePath: string,
  oursPath: string,
  theirsPath: string,
  git: GitRunner = runGit,
): void {
  const args = ['merge-file', '-L', OURS_LABEL, '-L', BASE_LABEL, '-L', THEIRS_LABEL];
  const r = git(process.cwd(), [...args, oursPath, basePath, theirsPath]);
  // Exit code is the conflict count (capped at 127); anything else is a failure.
  if (r.status >= 0 && r.status <= 127) return;
  writeFileSync(oursPath, wholeFileConflict(readText(oursPath), readText(theirsPath)), 'utf8');
}
