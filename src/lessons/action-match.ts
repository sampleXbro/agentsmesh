import { getGlobMatcher } from './glob-safety.js';
import type { LessonsGraph, Trigger } from './graph-schema.js';
import { keywordMatches } from './keyword-match.js';
import { commandCouldMatch } from './query.js';

/**
 * Does a recorded action (an outcome/recall `contextKey`) re-match one of a
 * lesson's OWN triggers? Uses recall's trigger semantics: file globs as in
 * queryLessons, command patterns and keyword triggers through
 * commandCouldMatch / keywordMatches. A `cmd:` key holds only the command
 * CLASS, so a pattern that needs the full argv (`git commit -m`) does not
 * re-match it — the check errs toward "no match", never a false one.
 */

export type ActionQuery = { readonly file: string } | { readonly command: string };

/** The recall query a stored action key stands for; null for `none` or unknown keys. */
export function queryFromContextKey(key: string): ActionQuery | null {
  if (key.startsWith('file:')) return { file: key.slice('file:'.length) };
  if (key.startsWith('cmd:') && key.length > 'cmd:'.length)
    return { command: key.slice('cmd:'.length) };
  return null;
}

export type ActionMatcher = (lessonId: string, contextKey: string) => boolean;

/**
 * A matcher over one graph. Globs use recall's safe matcher; an unsafe one never
 * matches. Each (lesson, action) answer is kept: effectiveness asks the same
 * pairs many times over one outcome log.
 */
export function createActionMatcher(graph: LessonsGraph): ActionMatcher {
  const seen = new Map<string, Map<string, boolean>>();
  return (lessonId, contextKey) => {
    let byKey = seen.get(lessonId);
    if (byKey === undefined) {
      byKey = new Map();
      seen.set(lessonId, byKey);
    }
    let hit = byKey.get(contextKey);
    if (hit === undefined) {
      hit = matchesOwnTrigger(graph, lessonId, contextKey);
      byKey.set(contextKey, hit);
    }
    return hit;
  };
}

function matchesOwnTrigger(graph: LessonsGraph, lessonId: string, contextKey: string): boolean {
  const query = queryFromContextKey(contextKey);
  const lesson = graph.lessons[lessonId];
  if (query === null || lesson === undefined) return false;
  const triggers = lesson.triggers
    .map((id) => graph.triggers[id])
    .filter((t): t is Trigger => t !== undefined);
  const patterns = (kind: Trigger['kind']): string[] =>
    triggers.filter((t) => t.kind === kind).map((t) => t.pattern);
  if ('command' in query) {
    return commandCouldMatch(patterns('command_pattern'), patterns('keyword'), query.command);
  }
  return (
    patterns('file_glob').some((p) => getGlobMatcher(p)?.test(query.file) ?? false) ||
    patterns('keyword').some((p) => keywordMatches(p, query))
  );
}
