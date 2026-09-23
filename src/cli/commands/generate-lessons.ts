import { lessonsGraphProblem } from '../../lessons/graph-problem.js';
import {
  ensureLessonsMergeDriver,
  mergeDriverSetupLine,
} from '../../lessons/merge-driver-setup.js';
import { recallHookTeamHint } from '../../lessons/recall-hook-hint.js';
import { logger } from '../../utils/output/logger.js';
import type { GenerateData } from '../command-result.js';

/**
 * Project-scope lessons upkeep that `generate` performs for every clone, so a
 * team stays healthy without anyone re-running `init --lessons`. Returns the
 * exit code to fold into the command's result.
 *
 * An unreadable graph fails `--check` (a CI gate) but only warns on a normal
 * run, since blocking generate would stall unrelated work. Only a real run
 * touches git config.
 */
export function runLessonsMaintenance(root: string, mode: GenerateData['mode']): number {
  const problem = lessonsGraphProblem(root);
  if (problem !== null) {
    if (mode === 'check') {
      logger.error(problem.message);
      return 1;
    }
    logger.warn(problem.message);
  }
  if (mode !== 'generate') return 0;
  const line = mergeDriverSetupLine(ensureLessonsMergeDriver(root));
  if (line !== null) logger.info(line);
  const hint = recallHookTeamHint(root);
  if (hint !== null) logger.warn(hint);
  return 0;
}
