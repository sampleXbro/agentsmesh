/**
 * Capture must store file triggers the way recall reads them: project-relative.
 *
 * The failure reminder used to suggest an absolute path, capture accepted it,
 * and recall then never matched it, so the lesson looked captured but could
 * never fire. The helper that fixes this exists; this pins that the real
 * capture entry point actually uses it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addLesson, TriggerFileGlobError } from '../../../src/lessons/add.js';
import { lessonsPaths } from '../../../src/lessons/paths.js';

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'add-root-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const OPTIONS = { allowNewTopic: true, topicSummary: 'Paths' } as const;

function storedFilePatterns(): string[] {
  const graph = JSON.parse(readFileSync(lessonsPaths(root).graph, 'utf8')) as {
    triggers: Record<string, { kind: string; pattern: string }>;
  };
  return Object.values(graph.triggers)
    .filter((t) => t.kind === 'file_glob')
    .map((t) => t.pattern);
}

describe('addLesson file triggers', () => {
  it('stores an absolute path inside the project as a project-relative glob', async () => {
    await addLesson(
      root,
      {
        rule: 'Keep refunds idempotent',
        topic: 'paths',
        triggers: { files: [join(root, 'src/api/refunds.ts')] },
      },
      OPTIONS,
    );
    expect(storedFilePatterns()).toEqual(['src/api/refunds.ts']);
  });

  it('rejects an absolute path outside the project, which could never fire', async () => {
    await expect(
      addLesson(
        root,
        { rule: 'Never touch system files', topic: 'paths', triggers: { files: ['/etc/hosts'] } },
        OPTIONS,
      ),
    ).rejects.toBeInstanceOf(TriggerFileGlobError);
  });

  it('keeps an already relative glob unchanged', async () => {
    await addLesson(
      root,
      { rule: 'Test every handler', topic: 'paths', triggers: { files: ['src/**/*.ts'] } },
      OPTIONS,
    );
    expect(storedFilePatterns()).toEqual(['src/**/*.ts']);
  });
});
