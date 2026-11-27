import { writeFileSync } from 'node:fs';
import { readTextOrEmpty as readText } from '../utils/filesystem/fs.js';
import { runGit, type GitRunner } from './git-exec.js';

const OURS_LABEL = 'this branch';
const BASE_LABEL = 'common ancestor';
const THEIRS_LABEL = 'incoming branch';

const withNewline = (text: string): string =>
  text === '' || text.endsWith('\n') ? text : `${text}\n`;

/** One conflict block holding both whole files (and the ancestor, if given); used when git cannot merge. */
export function wholeFileConflict(ours: string, theirs: string, base?: string): string {
  const ancestor = base === undefined ? '' : `||||||| ${BASE_LABEL}\n${withNewline(base)}`;
  return (
    `<<<<<<< ${OURS_LABEL}\n${withNewline(ours)}${ancestor}=======\n` +
    `${withNewline(theirs)}>>>>>>> ${THEIRS_LABEL}\n`
  );
}

/**
 * Write git's line-based three-way merge into `oursPath`, with conflict markers
 * (diff3 style, so the common ancestor stays in the file for `lessons resolve`)
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
  const args = ['merge-file', '--diff3', '-L', OURS_LABEL, '-L', BASE_LABEL, '-L', THEIRS_LABEL];
  const r = git(process.cwd(), [...args, oursPath, basePath, theirsPath]);
  // Exit code is the conflict count (capped at 127); anything else is a failure.
  if (r.status >= 0 && r.status <= 127) return;
  const whole = wholeFileConflict(readText(oursPath), readText(theirsPath), readText(basePath));
  writeFileSync(oursPath, whole, 'utf8');
}
