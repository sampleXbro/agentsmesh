import { realpathSync } from 'node:fs';
import { resolvesInsideRootSync } from '../utils/filesystem/path-containment.js';
import { lessonsPaths } from './paths.js';

/**
 * git keeps symlinks, so a cloned repo can link `.agentsmesh/lessons` (or
 * `.agentsmesh`) anywhere. The boundary is the project root, not `.agentsmesh`,
 * so a linked `.agentsmesh` fails too; a dangling link fails as well.
 */
export function lessonsDirInsideProject(projectRoot: string): boolean {
  return resolvesInsideRootSync(projectRoot, lessonsPaths(projectRoot).base);
}

export class LessonsDirOutsideProjectError extends Error {
  readonly code = 'LESSONS_DIR_OUTSIDE_PROJECT';

  constructor(projectRoot: string) {
    const base = lessonsPaths(projectRoot).base;
    let where = 'a path that does not exist';
    try {
      where = realpathSync(base).replaceAll('\\', '/');
    } catch {
      // A dangling link: keep the generic wording.
    }
    super(
      `${base.replaceAll('\\', '/')} resolves to ${where}, outside the project ` +
        `${projectRoot.replaceAll('\\', '/')}. agentsmesh only writes lessons inside the ` +
        'project; replace the link with a real folder.',
    );
    this.name = 'LessonsDirOutsideProjectError';
  }
}

/** Throws unless lessons may be written, locked or scaffolded in this project. */
export function assertLessonsDirInsideProject(projectRoot: string): void {
  if (!lessonsDirInsideProject(projectRoot)) throw new LessonsDirOutsideProjectError(projectRoot);
}
