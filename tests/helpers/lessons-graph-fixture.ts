import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Lesson, LessonsGraph } from '../../src/lessons/graph-schema.js';
import { graphFilePath } from '../../src/lessons/graph-store.js';

/** lessons.json holding an unresolved git merge. */
export const CONFLICTED_GRAPH_TEXT =
  '{\n<<<<<<< HEAD\n  "a": 1\n=======\n  "a": 2\n>>>>>>> other\n}\n';

/** Write raw text as the project's lessons.json (for unreadable-graph cases). */
export function writeGraphText(root: string, text: string): void {
  mkdirSync(dirname(graphFilePath(root)), { recursive: true });
  writeFileSync(graphFilePath(root), text, 'utf8');
}

/**
 * `count` lessons under topic `t`, each rule padded to `ruleChars`. Plain
 * lessons share the file_glob trigger `g` (`src/**`); `always` ones have none.
 */
export function bulkLessonsGraph(count: number, ruleChars: number, scope?: 'always'): LessonsGraph {
  const lessons: LessonsGraph['lessons'] = {};
  for (let i = 0; i < count; i += 1) {
    lessons[`l${String(i).padStart(2, '0')}`] = {
      rule: `Rule ${i} `.padEnd(ruleChars, 'x'),
      topics: ['t'],
      triggers: scope === 'always' ? [] : ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
      ...(scope === 'always' ? { scope } : {}),
    };
  }
  return {
    version: 2,
    topics: { t: { summary: 'T.' } },
    triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    lessons,
  };
}

/** An active lesson under topic `t` with no triggers. */
export function lesson(rule: string): Lesson {
  return {
    rule,
    topics: ['t'],
    triggers: [],
    evidence: [],
    status: 'active',
    createdAt: '2026-06-01',
  };
}
