import { CURRENT_GRAPH_VERSION } from '../../lessons/graph-schema.js';
import type { ResilientGraphLoad } from '../../lessons/graph-store.js';
import { lessonsSetupHint } from '../../lessons/paths.js';
import { mergeWarnings, strayDirWarning, unreadableGraphWarning } from './lessons-query-guards.js';
import type { LessonsQueryData } from './lessons-types.js';

type UnusableLoad = Exclude<ResilientGraphLoad, { status: 'ok' }>;

/**
 * Recall answer when there is no usable graph. Recall is a blocking step
 * before every edit, so it degrades to no lessons (exit 0) with a warning that
 * names the cause and the fix, never a stack trace.
 */
export function degradedQueryData(
  load: UnusableLoad,
  projectRoot: string,
  base: Pick<LessonsQueryData, 'query' | 'autoMigrated'>,
  keywordOnlyWarning: string | undefined,
  configWarning: string | undefined,
): LessonsQueryData {
  const data = { ...base, lessons: [], totalMatches: 0 };
  switch (load.status) {
    case 'corrupt':
      return {
        ...data,
        warning: mergeWarnings(unreadableGraphWarning(projectRoot, load.error), configWarning),
      };
    case 'newer-version':
      return {
        ...data,
        warning: mergeWarnings(
          `lessons.json is version ${load.version}, newer than this build supports (${CURRENT_GRAPH_VERSION}) — recall returned no lessons. Upgrade agentsmesh to read it.`,
          configWarning,
        ),
      };
    case 'absent':
      // A subdirectory of a lessons project gets "cd to the root"; otherwise
      // lessons are not set up here, so point at `init --lessons`.
      return {
        ...data,
        warning: mergeWarnings(
          strayDirWarning(projectRoot) ?? lessonsSetupHint(),
          keywordOnlyWarning,
          configWarning,
        ),
      };
  }
}
