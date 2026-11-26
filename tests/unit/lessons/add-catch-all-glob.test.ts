/**
 * `lessons add` refuses a NEW catch-all file glob (it matches every file, so the
 * lesson would be recalled on every edit) with a typed capture rejection that
 * points at `--scope always` or a file-class glob. Narrower broad globs stay
 * warnings, and a lesson that already has a catch-all trigger is not punished.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLesson, addLessonInto } from '../../../src/lessons/add.js';
import { CatchAllGlobError } from '../../../src/lessons/add-errors.js';
import { isCaptureRejection } from '../../../src/lessons/capture-rejection.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../src/lessons/graph-store.js';

let root: string;
const RULE = 'Prefer small focused functions over long ones.';

function seed(graph: Partial<LessonsGraph> = {}): void {
  saveLessonsGraph(root, {
    version: 2,
    lessons: {},
    topics: { build: { summary: 'Build.' } },
    triggers: {},
    ...graph,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-add-catch-all-'));
  seed();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('addLesson — a catch-all file glob is refused', () => {
  it.each(['**', '**/*', '**/**', './**/*', ' **/* ', '**\\*'])(
    'rejects %j with a typed capture rejection and writes nothing',
    async (glob) => {
      const before = readFileSync(graphFilePath(root), 'utf8');
      const err = await addLesson(root, {
        rule: RULE,
        topic: 'build',
        triggers: { files: [glob] },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CatchAllGlobError);
      expect(isCaptureRejection(err)).toBe(true);
      expect((err as CatchAllGlobError).code).toBe('CATCH_ALL_GLOB');
      expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
    },
  );

  it('rejects an absolute glob that is a catch-all once made project-relative', async () => {
    const err = await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: { files: [`${root}/**/*`] },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatchAllGlobError);
  });

  it('names the glob and both fixes in the message', async () => {
    const err = (await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: { files: ['**/*'] },
    }).catch((e: unknown) => e)) as CatchAllGlobError;
    expect(err.pattern).toBe('**/*');
    expect(err.message).toBe(
      'File glob "**/*" matches every file, so the lesson would be recalled on every edit. ' +
        'For a rule that applies to every task, use --scope always (scope: "always" over MCP). ' +
        'Otherwise use a file-class glob like "src/lib/use*Form*.ts".',
    );
  });

  it('rejects the catch-all even when another trigger is fine', async () => {
    await expect(
      addLesson(root, {
        rule: RULE,
        topic: 'build',
        triggers: { files: ['src/lib/use*Form*.ts', '**/*'], keywords: ['small functions'] },
      }),
    ).rejects.toBeInstanceOf(CatchAllGlobError);
    expect(loadLessonsGraph(root).lessons).toEqual({});
  });
});

describe('addLesson — broad but bounded globs stay warnings', () => {
  it.each(['src/**/*.ts', 'src/cli/**/*.ts', '**/*.ts', '*', '**/*.*', '!docs/**'])(
    'accepts %j',
    async (glob) => {
      const result = await addLesson(root, {
        rule: RULE,
        topic: 'build',
        triggers: { files: [glob] },
      });
      expect(result.isNewLesson).toBe(true);
    },
  );

  it('keeps warning BROAD_GLOB_TRIGGER for a broad glob', async () => {
    const result = await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: { files: ['**/*.ts'] },
    });
    expect(result.warnings.map((w) => w.code)).toContain('BROAD_GLOB_TRIGGER');
  });
});

describe('addLesson — only a new catch-all trigger is refused', () => {
  const legacy: Partial<LessonsGraph> = {
    triggers: { 't-glob-legacy': { kind: 'file_glob', pattern: '**/*' } },
    lessons: {
      'build-legacy': {
        rule: RULE,
        topics: ['build'],
        triggers: ['t-glob-legacy'],
        evidence: [],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
  };

  it('lets an upsert add a keyword to a lesson that already has the catch-all', async () => {
    seed(legacy);
    const result = await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: { keywords: ['small functions'] },
    });
    expect(result.isNewLesson).toBe(false);
    expect(result.id).toBe('build-legacy');
    expect(loadLessonsGraph(root).lessons['build-legacy']?.triggers).toHaveLength(2);
  });

  it('lets an upsert re-add the identical lesson with no new trigger', async () => {
    seed(legacy);
    const result = await addLesson(root, { rule: RULE, topic: 'build', triggers: {} });
    expect(result.isNewLesson).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it('lets an upsert re-pass the catch-all trigger node that already exists', async () => {
    seed(legacy);
    const result = await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: { files: ['**/*'] },
    });
    expect(result.isNewLesson).toBe(false);
    expect(result.newTriggerIds).toEqual([]);
  });
});

describe('addLesson — a catch-all node another lesson owns is refused too', () => {
  const OTHER = 'Run the formatter before you commit.';
  const owner: Partial<LessonsGraph> = {
    triggers: { 't-glob-legacy': { kind: 'file_glob', pattern: '**/*' } },
    lessons: {
      'build-owner': {
        rule: OTHER,
        topics: ['build'],
        triggers: ['t-glob-legacy'],
        evidence: [],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
  };

  it('refuses a new lesson that attaches the existing catch-all node', async () => {
    seed(owner);
    const before = readFileSync(graphFilePath(root), 'utf8');
    const err = await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: { files: ['**/*'] },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatchAllGlobError);
    expect((err as CatchAllGlobError).pattern).toBe('**/*');
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
  });

  it('refuses a different glob spelling that normalizes to the existing node', async () => {
    seed(owner);
    await expect(
      addLesson(root, { rule: RULE, topic: 'build', triggers: { files: ['./**/*'] } }),
    ).rejects.toBeInstanceOf(CatchAllGlobError);
  });

  it('refuses an upsert of another lesson that has no catch-all yet', async () => {
    seed({
      ...owner,
      lessons: {
        ...owner.lessons,
        'build-small': {
          rule: RULE,
          topics: ['build'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
          scope: 'always',
        },
      },
    });
    const before = readFileSync(graphFilePath(root), 'utf8');
    await expect(
      addLesson(root, { rule: RULE, topic: 'build', triggers: { files: ['**/*'] } }),
    ).rejects.toBeInstanceOf(CatchAllGlobError);
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
  });

  it('lets the owner re-add its own catch-all together with a new keyword', async () => {
    seed(owner);
    const result = await addLesson(root, {
      rule: OTHER,
      topic: 'build',
      triggers: { files: ['**/*'], keywords: ['formatter'] },
    });
    expect(result.id).toBe('build-owner');
    expect(result.isNewLesson).toBe(false);
    expect(loadLessonsGraph(root).lessons['build-owner']?.triggers).toHaveLength(2);
  });

  it('still lets a new lesson attach a narrow glob next to the catch-all owner', async () => {
    seed(owner);
    const result = await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: { files: ['src/lib/use*Form*.ts'] },
    });
    expect(result.isNewLesson).toBe(true);
  });
});

describe('addLesson — a rule for every task uses scope always', () => {
  it('captures an always-on lesson with no trigger', async () => {
    const result = await addLesson(root, {
      rule: RULE,
      topic: 'build',
      triggers: {},
      scope: 'always',
    });
    expect(result.isNewLesson).toBe(true);
    expect(loadLessonsGraph(root).lessons[result.id]?.scope).toBe('always');
  });
});

describe('addLessonInto — legacy merge recovery keeps folding lessons as-is', () => {
  it('accepts a catch-all glob when no project root is given and triggers are optional', () => {
    const graph: LessonsGraph = {
      version: 2,
      lessons: {},
      topics: { build: { summary: 'Build.' } },
      triggers: {},
    };
    const result = addLessonInto(
      graph,
      { rule: RULE, topic: 'build', triggers: { files: ['**/*'] } },
      { allowNoTrigger: true },
    );
    expect(result.isNewLesson).toBe(true);
    expect(Object.values(graph.triggers)).toEqual([{ kind: 'file_glob', pattern: '**/*' }]);
  });
});
