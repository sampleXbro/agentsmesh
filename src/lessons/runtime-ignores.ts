import { captureLogPath } from './capture-telemetry.js';
import { lessonsLockPath } from './lessons-lock.js';
import { outcomeLogPath } from './outcome-log.js';
import { lessonsPaths, toRelPath } from './paths.js';
import { recallLogPath } from './telemetry.js';
import { ensureGitignoreEntries } from '../utils/filesystem/gitignore.js';

/**
 * Keeps every lessons runtime file out of git: the three logs, the lock
 * directory, and the `*.tmp` files a killed atomic write leaves behind.
 * Idempotent and coverage-aware; true when `.gitignore` changed.
 */
export function ignoreLessonsRuntimeFiles(projectRoot: string): Promise<boolean> {
  return ensureGitignoreEntries(projectRoot, [
    toRelPath(projectRoot, recallLogPath(projectRoot)),
    toRelPath(projectRoot, captureLogPath(projectRoot)),
    toRelPath(projectRoot, outcomeLogPath(projectRoot)),
    `${toRelPath(projectRoot, lessonsLockPath(projectRoot))}/`,
    `${toRelPath(projectRoot, lessonsPaths(projectRoot).base)}/*.tmp`,
  ]);
}
