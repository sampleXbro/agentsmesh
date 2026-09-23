import {
  HOOK_INJECT_LIMIT,
  hiddenByCap,
  paragraphs,
  renderRecall,
  type RecallHookResult,
} from './hook-emit.js';
import { graphHealth, sessionNotices } from './hook-notices.js';
import { recallAlwaysLessons } from './recall-always.js';
import { recallLessons } from './recall.js';

/**
 * Task-level recall: the always-on lessons plus keyword recall over the task
 * text, capped like tool-call recall and deduped. It serves UserPromptSubmit
 * (the only event that carries the task text; the tool-call path never sees
 * intent, so a keyword-only lesson is otherwise unrecallable) and the session
 * start of hosts whose prompt event cannot inject context. Split from hook.ts
 * for the 200-line limit.
 */
export async function taskRecall(
  projectRoot: string,
  sessionId: string | undefined,
  taskText: string | undefined,
): Promise<RecallHookResult> {
  const always = await recallAlwaysLessons(projectRoot, { sessionId });
  const keyword =
    taskText === undefined
      ? undefined
      : await recallLessons(
          projectRoot,
          { keyword: taskText },
          { sessionId, limit: HOOK_INJECT_LIMIT },
        );
  // No task text, no keyword recall: read the graph health directly so an
  // unreadable graph is still reported on a prompt-less session start.
  const health = keyword ?? graphHealth(projectRoot);
  const notices = await sessionNotices(projectRoot, sessionId, health);
  // Two caps: the triggered rules (HOOK_INJECT_LIMIT) and the always-on budget.
  const triggered = (keyword?.lessons ?? []).map((l) => ({ id: l.id, rule: l.lesson.rule }));
  const hidden =
    keyword === undefined
      ? 0
      : hiddenByCap(keyword.totalMatches, keyword.suppressed, keyword.lessons.length);
  const alwaysHidden = Math.max(0, always.total - always.suppressed - always.lessons.length);
  return renderRecall(
    { rules: [...always.lessons, ...triggered], hidden, triggered: triggered.length, alwaysHidden },
    {
      event: 'UserPromptSubmit',
      lead: 'Recalled agentsmesh lessons for this task',
      preface: paragraphs(notices),
    },
  );
}
