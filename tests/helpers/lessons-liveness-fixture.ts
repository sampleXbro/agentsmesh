import { writeFileSync } from 'node:fs';
import { captureLesson } from '../../src/lessons/capture.js';
import type { AddLessonResult } from '../../src/lessons/add.js';
import type { LessonsGraph, Trigger } from '../../src/lessons/graph-schema.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../src/lessons/graph-store.js';
import { lessonsPaths } from '../../src/lessons/paths.js';
import { type ProjectFiles, projectFilesOf } from '../../src/lessons/project-files.js';

/** A graph with one active lesson `L` referencing every supplied trigger. */
export function graphWith(triggers: Record<string, Trigger>): LessonsGraph {
  return {
    version: 1,
    lessons: {
      L: {
        rule: 'Some rule.',
        topics: ['t'],
        triggers: Object.keys(triggers),
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers,
  };
}

/** `paths` on disk and tracked; git history renamed `renamed` paths away. */
export function filesWith(paths: string[], renamed: string[] = []): ProjectFiles {
  return projectFilesOf(paths, () => ({
    tracked: new Set(paths),
    deleted: new Set<string>(),
    renamedAway: new Set(renamed),
  }));
}

/**
 * Seeds lesson `a` with a live trigger (`src/keep.ts`) plus `pattern`, and turns
 * auto-prune on, so a later capture decides whether `pattern` gets detached.
 */
export function seedLessonWithGlob(root: string, pattern: string): void {
  saveLessonsGraph(root, {
    version: 1,
    lessons: {
      a: {
        rule: 'Rule A.',
        topics: ['t'],
        triggers: ['t-keep', 't-x'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: {
      't-keep': { kind: 'file_glob', pattern: 'src/keep.ts' },
      't-x': { kind: 'file_glob', pattern },
    },
  });
  writeFileSync(lessonsPaths(root).config, JSON.stringify({ autoPrune: true }), 'utf8');
}

/** A capture that has nothing to do with lesson `a`. */
export function captureUnrelated(root: string): Promise<AddLessonResult> {
  return captureLesson(root, {
    rule: 'Unrelated rule.',
    topic: 't',
    triggers: { files: ['src/other.ts'] },
  });
}

export function patternsOfLessonA(root: string): string[] {
  const graph = loadLessonsGraph(root);
  return (graph.lessons.a?.triggers ?? []).map(
    (id) => graph.triggers[id]?.pattern ?? `missing:${id}`,
  );
}
