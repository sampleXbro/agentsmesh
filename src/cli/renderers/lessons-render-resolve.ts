import { logger } from '../../utils/output/logger.js';
import type { LessonsResolveData } from '../commands/lessons-types.js';

const SOURCE: Record<LessonsResolveData['source'], string> = {
  index: 'the git merge stages',
  markers: 'the conflict markers in the file',
};

const NEXT: Record<NonNullable<LessonsResolveData['nextStep']>, string> = {
  merge: ', then finish the merge (git commit).',
  rebase: ', then git rebase --continue.',
  'cherry-pick': ', then git cherry-pick --continue.',
  revert: ', then git revert --continue.',
  none: ' and commit the fix.',
};

const NO_BASE: Record<LessonsResolveData['source'], string> = {
  index:
    'The merge base in git could not be read, so a trigger or topic that one branch deleted ' +
    'may be back. Check with `agentsmesh lessons validate`.',
  markers:
    'The conflict markers carry no merge base, so a trigger or topic that one branch deleted ' +
    'may be back. Check with `agentsmesh lessons validate`; set `git config ' +
    'merge.conflictStyle diff3` so later conflicts keep the base.',
};

/** Output of `agentsmesh lessons resolve`: what was combined, then the next git step. */
export function renderResolve(data: LessonsResolveData): void {
  const path = data.path.replaceAll('\\', '/');
  const lessons = `${data.lessonCount} lesson${data.lessonCount === 1 ? '' : 's'}`;
  if (data.alreadyResolved === true) {
    logger.success(
      `${path} is already resolved: it holds all ${lessons} from both branches, so it was left unchanged.`,
    );
  } else {
    logger.success(
      `Resolved ${path} from ${SOURCE[data.source]}: ${lessons} (${data.onlyOurs} only on this ` +
        `branch, ${data.onlyTheirs} only on the incoming branch).`,
    );
    if (data.introduced.length > 0) {
      logger.warn(
        `The combined graph has new validation errors: ${data.introduced.join('; ')}. ` +
          'Review them with `agentsmesh lessons validate` before staging.',
      );
    }
    if (!data.baseKnown) logger.warn(NO_BASE[data.source]);
  }
  if (data.nextStep !== null) logger.info(`  Next: git add ${path}${NEXT[data.nextStep]}`);
}
