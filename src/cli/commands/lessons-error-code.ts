import { errorCode } from '../error-code.js';
import type { LessonsCommandResult } from './lessons-types.js';

/**
 * Add the thrown error's own `code` (any string `code`, so new coded errors
 * flow through) to a failed result. Message and exit code are the caller's.
 */
export function withErrorCode<T extends LessonsCommandResult>(result: T, err: unknown): T {
  const code = errorCode(err);
  return code === undefined ? result : { ...result, code };
}
