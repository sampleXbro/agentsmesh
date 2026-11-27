import type { Lesson } from '../../lessons/graph-schema.js';
import type { RankedLesson } from '../../lessons/ranking.js';
import { capRulePayload, safeRuleLine } from '../../lessons/rule-line.js';
import type { LessonsQueryData } from './lessons-types.js';

type QueryRow = LessonsQueryData['lessons'][number];

/** Room for the `[id] ` and `NN. ` prefixes a printed line may carry. */
const LINE_PREFIX_CHARS = 8;

export function lessonRow(
  id: string,
  lesson: Lesson,
  extra: { readonly score?: number; readonly lexical?: true } = {},
): QueryRow {
  return {
    id,
    rule: lesson.rule,
    topics: [...lesson.topics],
    triggers: [...lesson.triggers],
    evidence: [...lesson.evidence],
    ...extra,
  };
}

export function rankedRow({ id, lesson, score, reason }: RankedLesson): QueryRow {
  return lessonRow(id, lesson, { score, ...(reason.lexical === true ? { lexical: true } : {}) });
}

/**
 * The `trim` for recall: keep the leading ranked rows that still fit the
 * printed-output cap (applied by renderQuery) after the always-on rows, so dedup
 * never marks a rule the plain or md output cuts as delivered.
 */
export function fitPrintedPayload(
  printedFirst: ReadonlyArray<{ readonly id: string; readonly rule: string }>,
): (ranked: RankedLesson[]) => RankedLesson[] {
  return (ranked) => {
    const rows = [...printedFirst, ...ranked.map(({ id, lesson }) => ({ id, rule: lesson.rule }))];
    const { kept } = capRulePayload(
      rows,
      (r) => safeRuleLine(r.rule).length + r.id.length + LINE_PREFIX_CHARS,
    );
    return ranked.slice(0, Math.max(0, kept.length - printedFirst.length));
  };
}
