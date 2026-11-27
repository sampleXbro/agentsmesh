import { mergeLessons } from '../../lessons/merge.js';
import { mutateLessonsGraph } from '../../lessons/mutate.js';
import { stripMarkersInGraph } from '../../lessons/strip-markers.js';
import { untriggerLesson } from '../../lessons/untrigger.js';
import { withErrorCode } from './lessons-error-code.js';
import { errorResult, type LessonsFlags } from './lessons-helpers.js';
import type {
  LessonsCommandResult,
  LessonsMergeData,
  LessonsStripMarkersData,
  LessonsUntriggerData,
} from './lessons-types.js';
import { errExitCode, errMessage } from './lessons-write-handlers.js';

/** Curation write handlers (`untrigger`, `merge`, `strip-markers`) — split from add/deprecate. */

export async function doUntrigger(
  lessonId: string | undefined,
  triggerId: string | undefined,
  projectRoot: string,
): Promise<LessonsCommandResult> {
  if (lessonId === undefined || lessonId === '' || triggerId === undefined || triggerId === '') {
    return errorResult(
      'untrigger',
      'Usage: agentsmesh lessons untrigger <lesson-id> <trigger-id>',
      2,
    );
  }
  try {
    const result = await mutateLessonsGraph(projectRoot, (graph) =>
      untriggerLesson(graph, lessonId, triggerId),
    );
    const data: LessonsUntriggerData = result;
    return { subcommand: 'untrigger', exitCode: 0, data };
  } catch (err) {
    return withErrorCode(errorResult('untrigger', errMessage(err), errExitCode(err)), err);
  }
}

export async function doMerge(
  loserId: string | undefined,
  keeperId: string | undefined,
  projectRoot: string,
): Promise<LessonsCommandResult> {
  if (loserId === undefined || loserId === '' || keeperId === undefined || keeperId === '') {
    return errorResult('merge', 'Usage: agentsmesh lessons merge <loser-id> <keeper-id>', 2);
  }
  try {
    const result = await mergeLessons(projectRoot, loserId, keeperId);
    const data: LessonsMergeData = result;
    return { subcommand: 'merge', exitCode: 0, data };
  } catch (err) {
    return withErrorCode(errorResult('merge', errMessage(err), errExitCode(err)), err);
  }
}

export async function doStripMarkers(
  flags: LessonsFlags,
  projectRoot: string,
): Promise<LessonsCommandResult> {
  const dryRun = flags['dry-run'] === true;
  try {
    const report = await stripMarkersInGraph(projectRoot, { dryRun });
    const data: LessonsStripMarkersData = {
      changedIds: report.changedIds,
      changedCount: report.changedCount,
      dryRun,
    };
    return { subcommand: 'strip-markers', exitCode: 0, data };
  } catch (err) {
    const data: LessonsStripMarkersData = { changedIds: [], changedCount: 0, dryRun };
    const failed = {
      subcommand: 'strip-markers' as const,
      exitCode: errExitCode(err),
      error: errMessage(err),
      data,
    };
    return withErrorCode(failed, err);
  }
}
