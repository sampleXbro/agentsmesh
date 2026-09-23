import { logger } from '../../utils/output/logger.js';
import type { LessonsResolveData } from '../commands/lessons-types.js';

const SOURCE: Record<LessonsResolveData['source'], string> = {
  index: 'the git merge stages',
  markers: 'the conflict markers in the file',
};

/** Output of `agentsmesh lessons resolve`: what was combined, then the next git step. */
export function renderResolve(data: LessonsResolveData): void {
  const path = data.path.replaceAll('\\', '/');
  const lessons = `${data.lessonCount} lesson${data.lessonCount === 1 ? '' : 's'}`;
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
  logger.info(
    `  Next: git add ${path}, then finish the merge (git commit, or git rebase --continue).`,
  );
}
