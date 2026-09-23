/**
 * Direct coverage for the `lessons_show` / `lessons_deprecate` handlers:
 * id-sorted topic listing, the supersede transition, and NOT_FOUND mapping.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lessonsDeprecate, lessonsShow } from '../../../../src/mcp/handlers/lessons-curation.js';
import { resolveContext, type McpContext } from '../../../../src/mcp/context.js';
import {
  graphFilePath,
  loadLessonsGraph,
  loadLessonsGraphResilient,
} from '../../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { McpError } from '../../../../src/mcp/errors.js';
import { problemFromLoad } from '../../../../src/lessons/graph-problem.js';

type Lesson = LessonsGraph['lessons'][string];

function lesson(rule: string, topic: string): Lesson {
  return {
    rule,
    topics: [topic],
    triggers: ['g'],
    evidence: [],
    status: 'active',
    createdAt: '2026-06-01',
  };
}

/** Persist the graph verbatim (no canonical key sort) so key order reaches the handler. */
function writeRawGraph(root: string, graph: LessonsGraph): void {
  const path = graphFilePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
}

/** Three topic-z lessons stored out of id order, plus one lesson in another topic. */
const unsortedGraph: LessonsGraph = {
  version: 1,
  lessons: {
    'topic-z-third': lesson('Third.', 'topic-z'),
    'topic-z-first': lesson('First.', 'topic-z'),
    'other-only': lesson('Other.', 'other'),
    'topic-z-second': lesson('Second.', 'topic-z'),
  },
  topics: { 'topic-z': { summary: 'Topic Z.' }, other: { summary: 'Other.' } },
  triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
};

let projectRoot: string;
let ctx: McpContext;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'am-'));
  await writeFile(join(projectRoot, 'agentsmesh.yaml'), 'version: 1\ntargets: []\nfeatures: []\n');
  writeRawGraph(projectRoot, unsortedGraph);
  ctx = await resolveContext({ cwd: projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('lessonsShow', () => {
  it('returns only the topic lessons, sorted by id ascending regardless of stored order', async () => {
    const r = await lessonsShow(ctx, { topic: 'topic-z' });
    if (!('lessons' in r)) throw new Error('expected the topic view');
    expect(r.topic).toBe('topic-z');
    expect(r.summary).toBe('Topic Z.');
    expect(r.lessons.map((l) => l.id)).toEqual([
      'topic-z-first',
      'topic-z-second',
      'topic-z-third',
    ]);
    expect(r.lessons[0]).toEqual({
      id: 'topic-z-first',
      rule: 'First.',
      status: 'active',
      topics: ['topic-z'],
      triggers: ['g'],
      evidence: [],
    });
  });

  it('throws NOT_FOUND for an unknown topic or lesson id', async () => {
    await expect(lessonsShow(ctx, { topic: 'ghost' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'lessons_show: unknown topic or lesson id "ghost".',
    });
  });

  it('shows one lesson by id when no topic has that id, like the CLI', async () => {
    expect(await lessonsShow(ctx, { topic: 'topic-z-second' })).toEqual({
      lesson: {
        id: 'topic-z-second',
        rule: 'Second.',
        status: 'active',
        topics: ['topic-z'],
        triggers: ['g'],
        evidence: [],
      },
    });
  });

  it('includes the replacement id of a superseded lesson', async () => {
    await lessonsDeprecate(ctx, { id: 'topic-z-first', superseded_by: 'topic-z-second' });
    const r = await lessonsShow(ctx, { topic: 'topic-z-first' });
    expect(r).toMatchObject({
      lesson: { id: 'topic-z-first', status: 'superseded', supersededBy: 'topic-z-second' },
    });
  });

  it('resolves a topic before a lesson with the same id', async () => {
    writeRawGraph(projectRoot, {
      ...unsortedGraph,
      lessons: { ...unsortedGraph.lessons, 'topic-z': lesson('Named like the topic.', 'other') },
    });
    const r = await lessonsShow(ctx, { topic: 'topic-z' });
    expect(r).toMatchObject({ topic: 'topic-z', summary: 'Topic Z.' });
  });

  it('throws NOT_FOUND when the project has no lessons graph at all', async () => {
    const fresh = await mkdtemp(join(tmpdir(), 'am-'));
    try {
      await writeFile(join(fresh, 'agentsmesh.yaml'), 'version: 1\ntargets: []\nfeatures: []\n');
      const freshCtx = await resolveContext({ cwd: fresh });
      await expect(lessonsShow(freshCtx, { topic: 'topic-z' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });
});

describe('lessonsDeprecate', () => {
  it('deprecates a lesson when no superseder is given', async () => {
    const r = await lessonsDeprecate(ctx, { id: 'topic-z-first' });
    expect(r).toEqual({ id: 'topic-z-first', status: 'deprecated', supersededBy: null });
    const stored = loadLessonsGraph(projectRoot).lessons['topic-z-first'];
    expect(stored?.status).toBe('deprecated');
    expect(stored?.supersededBy).toBeUndefined();
  });

  it('supersedes a lesson and records the replacement id when superseded_by is given', async () => {
    const r = await lessonsDeprecate(ctx, { id: 'topic-z-first', superseded_by: 'topic-z-second' });
    expect(r).toEqual({
      id: 'topic-z-first',
      status: 'superseded',
      supersededBy: 'topic-z-second',
    });
    const stored = loadLessonsGraph(projectRoot).lessons['topic-z-first'];
    expect(stored?.status).toBe('superseded');
    expect(stored?.supersededBy).toBe('topic-z-second');
    expect(loadLessonsGraph(projectRoot).lessons['topic-z-second']?.status).toBe('active');
  });

  it('maps an unknown lesson id to NOT_FOUND', async () => {
    await expect(lessonsDeprecate(ctx, { id: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'lessons_deprecate: Unknown lesson: nope.',
    });
  });

  it('maps an unknown superseder to NOT_FOUND', async () => {
    await expect(
      lessonsDeprecate(ctx, { id: 'topic-z-first', superseded_by: 'nope' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'lessons_deprecate: Unknown superseder: nope.',
    });
  });

  it('reports a corrupt graph with the shared diagnosis, not raw parser text', async () => {
    writeFileSync(graphFilePath(projectRoot), '{ truncated', 'utf8');
    const err = await lessonsDeprecate(ctx, { id: 'topic-z-first' }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe('VALIDATION_FAILED');
    expect((err as McpError).details).toEqual({ code: 'CORRUPT_GRAPH' });
    expect((err as McpError).message).toBe(
      problemFromLoad(projectRoot, loadLessonsGraphResilient(projectRoot))?.message,
    );
  });
});
