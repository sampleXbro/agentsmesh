import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLesson } from '../../src/lessons/capture.js';
import { loadLessonsGraph } from '../../src/lessons/graph-store.js';
import { listProjectFiles } from '../../src/lessons/project-files.js';
import { validateLessonsGraph } from '../../src/lessons/validate.js';
import {
  captureUnrelated,
  patternsOfLessonA,
  seedLessonWithGlob,
} from '../helpers/lessons-liveness-fixture.js';
import { commitAll, git, initRepo, writeFile } from '../helpers/temp-git-repo.js';

let root: string;

/** Git repo with `src/keep.ts`, `src/other.ts` and any `extra` files committed. */
function repoWith(extra: string[] = []): void {
  initRepo(root);
  for (const rel of ['src/keep.ts', 'src/other.ts', ...extra]) writeFile(root, rel, `// ${rel}\n`);
  commitAll(root, 'init');
}

function deadGlobFindings(): string[] {
  const report = validateLessonsGraph(loadLessonsGraph(root), {
    knownPaths: listProjectFiles(root)!,
  });
  return report.findings.filter((f) => f.code === 'DEAD_FILE_GLOB').map((f) => f.triggerId ?? '');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-glob-live-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('auto-prune keeps globs that git never removed (pending)', () => {
  it('keeps a trigger on gitignored build output that is not built yet', async () => {
    repoWith(['.gitignore']);
    writeFile(root, '.gitignore', 'dist/\n');
    commitAll(root, 'ignore dist');
    seedLessonWithGlob(root, 'dist/cli.js');

    const result = await captureUnrelated(root);
    expect(result.autoPruned).toBeUndefined();
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts', 'dist/cli.js']);
    expect(deadGlobFindings()).toEqual([]);
  });

  it('keeps a trigger on a file not created yet, and warns PENDING_GLOB instead of "likely a rename"', async () => {
    repoWith();
    seedLessonWithGlob(root, 'src/other.ts');
    const created = await captureLesson(root, {
      rule: 'Refunds must be idempotent.',
      topic: 't',
      triggers: { files: ['src/api/refunds.ts', 'src/other.ts'] },
    });
    expect(created.warnings.map((w) => w.code)).toEqual(['PENDING_GLOB']);

    await captureUnrelated(root);
    const graph = loadLessonsGraph(root);
    const patterns = graph.lessons[created.id]!.triggers.map((id) => graph.triggers[id]!.pattern);
    expect(patterns).toEqual(['src/api/refunds.ts', 'src/other.ts']);
  });

  it('keeps a wildcard over files that come and go (a release deleted every changeset)', async () => {
    repoWith(['.changeset/lucky-fox.md']);
    git(root, ['rm', '--quiet', '.changeset/lucky-fox.md']);
    commitAll(root, 'release');
    seedLessonWithGlob(root, '.changeset/*.md');

    expect((await captureUnrelated(root)).autoPruned).toBeUndefined();
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts', '.changeset/*.md']);
  });

  it('keeps a tracked file deleted from disk but not committed', async () => {
    repoWith(['src/wip.ts']);
    unlinkSync(join(root, 'src/wip.ts'));
    seedLessonWithGlob(root, 'src/wip.ts');

    expect((await captureUnrelated(root)).autoPruned).toBeUndefined();
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts', 'src/wip.ts']);
  });

  it('keeps a file that only exists, or was only deleted, on another branch', async () => {
    repoWith();
    git(root, ['checkout', '--quiet', '-b', 'feature']);
    writeFile(root, 'src/feature.ts');
    commitAll(root, 'add feature');
    git(root, ['rm', '--quiet', 'src/feature.ts']);
    commitAll(root, 'drop feature on the branch');
    git(root, ['checkout', '--quiet', 'main']);
    seedLessonWithGlob(root, 'src/feature.ts');

    expect((await captureUnrelated(root)).autoPruned).toBeUndefined();
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts', 'src/feature.ts']);
  });
});

describe('auto-prune detaches globs whose path git history removed (dead)', () => {
  it('detaches a glob whose file was renamed, and warns DEAD_GLOB at capture', async () => {
    repoWith(['src/old-name.ts']);
    git(root, ['mv', 'src/old-name.ts', 'src/new-name.ts']);
    commitAll(root, 'rename');
    seedLessonWithGlob(root, 'src/old-name.ts');
    expect(deadGlobFindings()).toEqual(['t-x']);

    const result = await captureUnrelated(root);
    expect(result.autoPruned).toEqual({
      removedTriggers: 1,
      removedTopics: 0,
      detachedDeadGlobs: 1,
    });
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts']);

    const again = await captureLesson(root, {
      rule: 'Old name rule.',
      topic: 't',
      triggers: { files: ['src/old-name.ts', 'src/other.ts'] },
    });
    expect(again.warnings.map((w) => w.code)).toEqual(['DEAD_GLOB']);
    expect(again.warnings[0]!.message).toContain('likely a rename');
  });

  it('detaches a glob whose file was deleted in a commit', async () => {
    repoWith(['src/doomed.ts']);
    git(root, ['rm', '--quiet', 'src/doomed.ts']);
    commitAll(root, 'delete');
    seedLessonWithGlob(root, 'src/doomed.ts');
    expect(deadGlobFindings()).toEqual(['t-x']);

    const result = await captureUnrelated(root);
    expect(result.autoPruned).toEqual({
      removedTriggers: 1,
      removedTopics: 0,
      detachedDeadGlobs: 1,
    });
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts']);
  });
});
