import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLesson } from '../../src/lessons/capture.js';
import {
  captureUnrelated,
  patternsOfLessonA,
  seedLessonWithGlob,
} from '../helpers/lessons-liveness-fixture.js';
import { commitAll, git, initRepo, writeFile } from '../helpers/temp-git-repo.js';

// Lets a test shrink the walk cap so "the walk hit its cap" is cheap to reach.
const walk = vi.hoisted(() => ({ cap: undefined as number | undefined }));
vi.mock('../../src/lessons/project-files.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lessons/project-files.js')>();
  return { ...mod, listProjectFiles: (root: string) => mod.listProjectFiles(root, walk.cap) };
});

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-glob-unknown-'));
  walk.cap = undefined;
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('glob liveness without enough evidence never detaches', () => {
  it('outside a git work tree: keeps the glob and only reports it as pending', async () => {
    writeFile(root, 'src/keep.ts');
    writeFile(root, 'src/other.ts');
    seedLessonWithGlob(root, 'src/old-name.ts');

    const result = await captureLesson(root, {
      rule: 'Old name rule.',
      topic: 't',
      triggers: { files: ['src/old-name.ts', 'src/other.ts'] },
    });
    expect(result.warnings.map((w) => w.code)).toEqual(['PENDING_GLOB']);
    expect(result.autoPruned).toBeUndefined();
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts', 'src/old-name.ts']);
  });

  it('when the walk hits its cap: judges nothing (unknown), even a glob git proves renamed', async () => {
    initRepo(root);
    for (const rel of ['src/keep.ts', 'src/other.ts', 'src/old-name.ts', 'zzz/a.ts', 'zzz/b.ts']) {
      writeFile(root, rel, `// ${rel}\n`);
    }
    commitAll(root, 'init');
    git(root, ['mv', 'src/old-name.ts', 'src/new-name.ts']);
    commitAll(root, 'rename');
    seedLessonWithGlob(root, 'src/old-name.ts');
    walk.cap = 3;

    const result = await captureLesson(root, {
      rule: 'Old name rule.',
      topic: 't',
      triggers: { files: ['src/old-name.ts', 'src/other.ts'] },
    });
    expect(result.warnings.map((w) => w.code)).toEqual([]);
    expect(result.autoPruned).toBeUndefined();
    expect(patternsOfLessonA(root)).toEqual(['src/keep.ts', 'src/old-name.ts']);

    // Same repo, uncapped walk: the rename is proven, so the glob is detached.
    walk.cap = undefined;
    expect((await captureUnrelated(root)).autoPruned?.detachedDeadGlobs).toBe(2);
  });
});
