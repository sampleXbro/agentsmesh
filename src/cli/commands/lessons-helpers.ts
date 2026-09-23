import { todayIso } from '../../lessons/add-helpers.js';
import type { LessonsGraph } from '../../lessons/graph-schema.js';
import type { LessonsCommandResult, LessonsQueryFormat } from './lessons-types.js';

export type LessonsFlags = Record<string, string | boolean | string[]>;

export function stringFlag(flags: LessonsFlags, name: string): string | null {
  const v = flags[name];
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

export function listFlag(flags: LessonsFlags, name: string): string[] {
  const v = flags[name];
  if (v === undefined || v === false || v === true) return [];
  if (Array.isArray(v)) return v.filter((s) => s.length > 0);
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Opaque repeated values — each occurrence is one value, NEVER comma-split.
 * Trigger patterns (regexes like `^foo{1,3}$`, globs like `src/{a,b}/**`)
 * legitimately contain commas; splitting them would create broken triggers.
 * Pass the flag multiple times for multiple values.
 */
export function repeatedFlag(flags: LessonsFlags, name: string): string[] {
  const v = flags[name];
  if (v === undefined || v === false || v === true) return [];
  if (Array.isArray(v)) return v.filter((s) => s.length > 0);
  return v.length > 0 ? [v] : [];
}

export function numberFlag(flags: LessonsFlags, name: string): number | null {
  const v = flags[name];
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseFormat(flags: LessonsFlags): LessonsQueryFormat {
  const raw = stringFlag(flags, 'format');
  if (raw === 'md' || raw === 'json' || raw === 'plain') return raw;
  return 'plain';
}

export function queryFromFlags(flags: LessonsFlags): {
  file?: string;
  command?: string;
  keyword?: string;
} {
  const out: { file?: string; command?: string; keyword?: string } = {};
  const file = stringFlag(flags, 'file');
  const command = stringFlag(flags, 'cmd') ?? stringFlag(flags, 'command');
  const keyword = stringFlag(flags, 'keyword');
  if (file !== null) out.file = file;
  if (command !== null) out.command = command;
  if (keyword !== null) out.keyword = keyword;
  return out;
}

export { todayIso };

export function renderTopicMarkdown(
  id: string,
  summary: string,
  lessons: Array<[string, LessonsGraph['lessons'][string]]>,
): string {
  const lines = [`# ${id}`, '', summary, '', '## Lessons', ''];
  for (const [lessonId, lesson] of lessons) {
    lines.push(`- **${lessonId}** — ${lesson.rule}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Full detail for a single lesson — the diagnosis view for `show <lesson-id>`.
 * Resolves each trigger id to its kind + pattern (so an irrelevant recall can be
 * traced to the trigger that fired and then retired with `deprecate`/`untrigger`).
 */
export function renderLessonMarkdown(
  id: string,
  lesson: LessonsGraph['lessons'][string],
  triggers: LessonsGraph['triggers'],
): string {
  const lines = [
    `# ${id}`,
    '',
    `**status:** ${lesson.status}    **created:** ${lesson.createdAt}`,
    '',
    lesson.rule,
    '',
    `**topics:** ${lesson.topics.length > 0 ? lesson.topics.join(', ') : '(none)'}`,
    '',
    '**triggers:**',
  ];
  if (lesson.triggers.length === 0) lines.push('- (none)');
  for (const tid of lesson.triggers) {
    const t = triggers[tid];
    lines.push(t ? `- ${tid} [${t.kind}] ${t.pattern}` : `- ${tid} [missing trigger node]`);
  }
  lines.push(
    '',
    `**evidence:** ${lesson.evidence.length > 0 ? lesson.evidence.join(', ') : '(none)'}`,
  );
  if (lesson.supersededBy !== undefined) {
    lines.push('', `**superseded by:** ${lesson.supersededBy}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Subcommands that can fail with a user-facing error and a placeholder data shape. */
type ErrorableSubcommand =
  | 'query'
  | 'add'
  | 'show'
  | 'deprecate'
  | 'merge'
  | 'untrigger'
  | 'import-md'
  | 'prune';

export function errorResult(
  subcommand: ErrorableSubcommand,
  message: string,
  exitCode: number,
): LessonsCommandResult {
  switch (subcommand) {
    case 'query':
      return {
        subcommand,
        exitCode,
        error: message,
        format: 'plain',
        data: { lessons: [], query: {}, autoMigrated: false, totalMatches: 0 },
      };
    case 'add':
      return {
        subcommand,
        exitCode,
        error: message,
        data: {
          id: '',
          isNewLesson: false,
          isNewTopic: false,
          newTriggerIds: [],
          changes: [],
          warnings: [],
        },
      };
    case 'show':
      return { subcommand, exitCode, error: message, data: { subject: '', markdown: '' } };
    case 'deprecate':
      return { subcommand, exitCode, error: message, data: { id: '', supersededBy: null } };
    case 'merge':
      return { subcommand, exitCode, error: message, data: { loserId: '', keeperId: '' } };
    case 'untrigger':
      return {
        subcommand,
        exitCode,
        error: message,
        data: { lessonId: '', triggerId: '', removedTriggerNode: false, remainingTriggerCount: 0 },
      };
    case 'import-md':
      return {
        subcommand,
        exitCode,
        error: message,
        data: {
          topicCount: 0,
          lessonCount: 0,
          triggerCount: 0,
          wroteGraphPath: '',
          deletedPaths: [],
        },
      };
    case 'prune':
      return {
        subcommand,
        exitCode,
        error: message,
        data: {
          applied: false,
          cap: 0,
          removedTriggerIds: [],
          removedTopicIds: [],
          trimmedLessons: [],
          removedDeadGlobs: [],
          unreachableLessons: [],
        },
      };
  }
}
