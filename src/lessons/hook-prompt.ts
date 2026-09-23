import { HOOK_INJECT_LIMIT, paragraphs, renderRecall, type RecallHookResult } from './hook-emit.js';
import { sessionNotices } from './hook-notices.js';
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
  const notices = await sessionNotices(projectRoot, sessionId, keyword ?? {});
  const rules = [
    ...always.lessons,
    ...(keyword?.lessons ?? []).map((l) => ({ id: l.id, rule: l.lesson.rule })),
  ];
  return renderRecall(
    { rules, hidden: 0 },
    {
      event: 'UserPromptSubmit',
      lead: 'Recalled agentsmesh lessons for this task',
      preface: paragraphs(notices),
    },
  );
}
