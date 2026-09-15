import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const LEGACY_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/lessons/legacy-input',
);
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';
import { mcpSessionId } from '../../../../src/mcp/handlers/lessons-query.js';
import { AUTO_SESSION_TTL_MS } from '../../../../src/lessons/seen-cache.js';
import { seenStorePath } from '../../../../src/lessons/seen-store.js';
import type { McpContext } from '../../../../src/mcp/context.js';
import { resolveContext } from '../../../../src/mcp/context.js';
import {
  graphFilePath,
  saveLessonsGraph,
  loadLessonsGraph,
} from '../../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { McpError } from '../../../../src/mcp/errors.js';
import { DEFAULT_RECALL_MAX_TOKENS } from '../../../../src/lessons/ranking.js';

/** Persist a graph WITHOUT canonicalizing, preserving the literal key order. */
function writeRawGraph(root: string, graph: LessonsGraph): void {
  const path = graphFilePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
}

let projectRoot: string;
let ctx: McpContext;

const seedGraph: LessonsGraph = {
  version: 1,
  lessons: {
    'topic-x-rule-1': {
      rule: 'Normalize CLI paths.',
      topics: ['topic-x'],
      triggers: ['t-glob'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-05',
    },
  },
  topics: { 'topic-x': { summary: 'Topic X.' } },
  triggers: { 't-glob': { kind: 'file_glob', pattern: 'src/cli/**/*.ts' } },
};

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'amesh-mcp-lessons-'));
  await mkdir(join(projectRoot, '.agentsmesh'), { recursive: true });
  await writeFile(
    join(projectRoot, 'agentsmesh.yaml'),
    'version: 1\ntargets: []\nfeatures: []\n',
    'utf8',
  );
  saveLessonsGraph(projectRoot, seedGraph);
  ctx = await resolveContext({ cwd: projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('lessonsHandlers.query — session dedup (default on)', () => {
  it('suppresses a repeat recall by default and reports the suppressed count', async () => {
    const r1 = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(r1.lessons).toHaveLength(1);
    const r2 = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(r2.lessons).toHaveLength(0);
    expect(r2.suppressed).toBe(1);
  });

  it('no_dedup returns the full set even after a prior delivery', async () => {
    await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    const r = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts', no_dedup: true });
    expect(r.lessons).toHaveLength(1);
  });

  it("accepts the CLI-flag alias 'no-dedup' for no_dedup", async () => {
    await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    const r = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts', 'no-dedup': true });
    expect(r.lessons).toHaveLength(1);
  });

  it('bounds suppression with a TTL — an aged delivery resurfaces', async () => {
    // The MCP server has no compaction signal (unlike the hook's SessionStart
    // reset), so an unbounded correlator would hide a mandatory rule for the
    // whole server lifetime once the client compacted it away. Age the store
    // past the window and the rule must come back.
    const r1 = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(r1.lessons).toHaveLength(1);
    expect((await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' })).lessons).toHaveLength(0);

    const path = seenStorePath(mcpSessionId(), projectRoot);
    const aged = Date.now() - (AUTO_SESSION_TTL_MS + 60_000);
    const stored = JSON.parse(readFileSync(path, 'utf8')) as { seen: Record<string, number> };
    writeFileSync(
      path,
      JSON.stringify({
        v: 2,
        seen: Object.fromEntries(Object.keys(stored.seen).map((k) => [k, aged])),
      }),
      'utf8',
    );
    const r3 = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(r3.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
  });

  it('an explicit session isolates dedup state per correlator', async () => {
    const a1 = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts', session: 's-a' });
    expect(a1.lessons).toHaveLength(1);
    const a2 = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts', session: 's-a' });
    expect(a2.lessons).toHaveLength(0);
    const b1 = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts', session: 's-b' });
    expect(b1.lessons).toHaveLength(1);
  });
});

describe('lessonsHandlers.query', () => {
  it('returns matching lessons when file glob matches', async () => {
    const r = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(r.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
  });

  it('returns empty when nothing matches', async () => {
    const r = await lessonsHandlers.query(ctx, { file: 'docs/readme.md' });
    expect(r.lessons).toEqual([]);
  });

  it('rejects a query with no predicate (file/command/keyword)', async () => {
    await expect(lessonsHandlers.query(ctx, {})).rejects.toThrow(
      /file.*command.*keyword|predicate/i,
    );
  });

  it('matches a file glob when --file is passed as an absolute path', async () => {
    const r = await lessonsHandlers.query(ctx, { file: join(projectRoot, 'src/cli/x.ts') });
    expect(r.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
  });

  it('matches a file glob when --file is ./-prefixed', async () => {
    const r = await lessonsHandlers.query(ctx, { file: './src/cli/x.ts' });
    expect(r.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
  });

  it('returns empty (does not throw) when the canonical graph is corrupt', async () => {
    writeFileSync(graphFilePath(projectRoot), '{ truncated', 'utf8');
    const r = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(r.lessons).toEqual([]);
    expect(r.totalMatches).toBe(0);
  });

  it('is compact by default: id + rule only, no metadata', async () => {
    const r = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(r.lessons[0]?.id).toBe('topic-x-rule-1');
    expect(r.lessons[0]?.rule).toBe('Normalize CLI paths.');
    expect(r.lessons[0]?.triggers).toBeUndefined();
    expect(r.lessons[0]?.evidence).toBeUndefined();
  });

  it('includes metadata only when verbose=true', async () => {
    const r = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts', verbose: true });
    expect(r.lessons[0]?.triggers).toEqual(['t-glob']);
    expect(r.lessons[0]?.topics).toEqual(['topic-x']);
  });

  it('caps results to the limit param and reports totalMatches', async () => {
    const many: LessonsGraph = {
      version: 1,
      lessons: {
        'a-1': {
          rule: 'One.',
          topics: ['t'],
          triggers: ['g'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'a-2': {
          rule: 'Two.',
          topics: ['t'],
          triggers: ['g'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'a-3': {
          rule: 'Three.',
          topics: ['t'],
          triggers: ['g'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    };
    saveLessonsGraph(projectRoot, many);
    const r = await lessonsHandlers.query(ctx, { file: 'src/x.ts', limit: 1 });
    expect(r.lessons.length).toBe(1);
    expect(r.totalMatches).toBe(3);
  });

  it('applies a default token budget when max_tokens is omitted', async () => {
    const filler = 'word '.repeat(Math.ceil((DEFAULT_RECALL_MAX_TOKENS * 2) / 15)).trim(); // scales with the default budget
    const lessons: LessonsGraph['lessons'] = {};
    for (let i = 0; i < 20; i++) {
      lessons[`b-${i}`] = {
        rule: `Budget rule ${i} ${filler}`,
        topics: ['t'],
        triggers: ['g'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      };
    }
    saveLessonsGraph(projectRoot, {
      version: 1,
      lessons,
      topics: { t: { summary: 'T.' } },
      triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    });
    const r = await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
    expect(r.totalMatches).toBe(20);
    // The default budget trims below the default 10-result limit.
    expect(r.lessons.length).toBeLessThan(10);
  });

  it('accepts the CLI-flag alias `cmd` for `command`', async () => {
    saveLessonsGraph(projectRoot, {
      version: 1,
      lessons: {
        'topic-x-rule-1': {
          rule: 'Run the build first.',
          topics: ['topic-x'],
          triggers: ['t-cmd'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-05',
        },
      },
      topics: { 'topic-x': { summary: 'Topic X.' } },
      triggers: { 't-cmd': { kind: 'command_pattern', pattern: '^pnpm build' } },
    });
    // no_dedup: the two calls hit the same action key; default dedup would hide
    // the second and mask the alias-equivalence this test asserts.
    const viaCmd = await lessonsHandlers.query(ctx, { cmd: 'pnpm build --watch', no_dedup: true });
    const viaCommand = await lessonsHandlers.query(ctx, {
      command: 'pnpm build --watch',
      no_dedup: true,
    });
    expect(viaCmd.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
    expect(viaCmd.lessons).toEqual(viaCommand.lessons);
  });

  it('prefers the canonical `command` over the `cmd` alias when both are present', async () => {
    const r = await lessonsHandlers.query(ctx, { command: 'src/cli/x', cmd: 'no-match-here' });
    // `command` wins; with the seed graph (file_glob only) nothing matches a command.
    expect(r.lessons).toEqual([]);
  });

  it('accepts the `max-tokens` alias for `max_tokens`', async () => {
    const filler = 'word '.repeat(Math.ceil((DEFAULT_RECALL_MAX_TOKENS * 2) / 15)).trim();
    const lessons: LessonsGraph['lessons'] = {};
    for (let i = 0; i < 20; i++) {
      lessons[`b-${i}`] = {
        rule: `Budget rule ${i} ${filler}`,
        topics: ['t'],
        triggers: ['g'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      };
    }
    saveLessonsGraph(projectRoot, {
      version: 1,
      lessons,
      topics: { t: { summary: 'T.' } },
      triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    });
    const tiny = await lessonsHandlers.query(ctx, { file: 'src/x.ts', 'max-tokens': 70 });
    expect(tiny.totalMatches).toBe(20);
    expect(tiny.lessons.length).toBe(1); // a ~70-token budget keeps only the top result
  });

  it('returns empty when no graph exists', async () => {
    const fresh = await mkdtemp(join(tmpdir(), 'amesh-mcp-fresh-'));
    await writeFile(
      join(fresh, 'agentsmesh.yaml'),
      'version: 1\ntargets: []\nfeatures: []\n',
      'utf8',
    );
    const freshCtx = await resolveContext({ cwd: fresh });
    const r = await lessonsHandlers.query(freshCtx, { file: 'src/x.ts' });
    expect(r.lessons).toEqual([]);
    await rm(fresh, { recursive: true, force: true });
  });
});

describe('lessonsHandlers — legacy auto-migration (no stranding)', () => {
  it('migrates a legacy-only project on MCP query instead of returning empty', async () => {
    const legacy = await mkdtemp(join(tmpdir(), 'amesh-mcp-legacy-'));
    await writeFile(
      join(legacy, 'agentsmesh.yaml'),
      'version: 1\ntargets: []\nfeatures: []\n',
      'utf8',
    );
    cpSync(LEGACY_FIXTURE, join(legacy, '.agentsmesh/lessons'), { recursive: true });
    const legacyCtx = await resolveContext({ cwd: legacy });

    const r = await lessonsHandlers.query(legacyCtx, { keyword: 'alpha' });
    expect(existsSync(join(legacy, '.agentsmesh/lessons/lessons.json'))).toBe(true);
    expect(existsSync(join(legacy, '.agentsmesh/lessons/index.yaml'))).toBe(false);
    expect(r.lessons.length).toBeGreaterThan(0);
    await rm(legacy, { recursive: true, force: true });
  });

  it('migrates before add so capture enriches the migrated graph, not a fresh stub', async () => {
    const legacy = await mkdtemp(join(tmpdir(), 'amesh-mcp-legacy-add-'));
    await writeFile(
      join(legacy, 'agentsmesh.yaml'),
      'version: 1\ntargets: []\nfeatures: []\n',
      'utf8',
    );
    cpSync(LEGACY_FIXTURE, join(legacy, '.agentsmesh/lessons'), { recursive: true });
    const legacyCtx = await resolveContext({ cwd: legacy });

    const before = await lessonsHandlers.topics(legacyCtx); // triggers migration
    await lessonsHandlers.add(legacyCtx, {
      rule: 'A freshly captured MCP rule.',
      topic: before.topics[0]?.id ?? 'alpha',
      trigger_files: ['src/**'],
    });
    expect(existsSync(join(legacy, '.agentsmesh/lessons/index.yaml'))).toBe(false);
    await rm(legacy, { recursive: true, force: true });
  });
});

describe('lessonsHandlers.topics', () => {
  it('lists topic ids and summaries sorted by id', async () => {
    const r = await lessonsHandlers.topics(ctx);
    expect(r.topics).toEqual([{ id: 'topic-x', summary: 'Topic X.' }]);
  });

  it('sorts multiple topics by id when stored out of order', async () => {
    // Write the graph with keys in DESCENDING order (bypassing the canonicalizing
    // saver) so the handler's id-sort receives genuinely unsorted input.
    writeRawGraph(projectRoot, {
      version: 1,
      lessons: {},
      topics: { 'z-t': { summary: 'Z.' }, 'm-t': { summary: 'M.' }, 'a-t': { summary: 'A.' } },
      triggers: {},
    });
    const r = await lessonsHandlers.topics(ctx);
    expect(r.topics.map((t) => t.id)).toEqual(['a-t', 'm-t', 'z-t']);
  });

  it('returns no topics when no graph exists', async () => {
    const fresh = await mkdtemp(join(tmpdir(), 'amesh-mcp-topics-'));
    await writeFile(
      join(fresh, 'agentsmesh.yaml'),
      'version: 1\ntargets: []\nfeatures: []\n',
      'utf8',
    );
    const freshCtx = await resolveContext({ cwd: fresh });
    const r = await lessonsHandlers.topics(freshCtx);
    expect(r.topics).toEqual([]);
    await rm(fresh, { recursive: true, force: true });
  });
});

describe('lessonsHandlers.add', () => {
  it('adds a lesson and returns its id', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'Another rule.',
      topic: 'topic-x',
      trigger_files: ['src/foo/**/*.ts'],
      evidence: ['commit:abc'],
    });
    expect(r.isNewLesson).toBe(true);
    const graph = loadLessonsGraph(projectRoot);
    expect(graph.lessons[r.id]?.rule).toBe('Another rule.');
  });

  it('rejects unknown topic without new_topic', async () => {
    await expect(
      lessonsHandlers.add(ctx, {
        rule: 'X.',
        topic: 'ghost',
        trigger_files: ['src/**'],
      }),
    ).rejects.toThrow(/unknown topic/i);
  });

  it('captures an always-on lesson with scope="always" and no trigger', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'Write comments per the repo style.',
      topic: 'topic-x',
      scope: 'always',
    });
    expect(loadLessonsGraph(projectRoot).lessons[r.id]?.scope).toBe('always');
  });

  it('rejects a scope other than "always"', async () => {
    await expect(
      lessonsHandlers.add(ctx, { rule: 'X.', topic: 'topic-x', scope: 'sometimes' }),
    ).rejects.toThrow(/scope must be/i);
  });

  it('creates a topic when new_topic + topic_summary are provided', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'New topic rule.',
      topic: 'fresh',
      topic_summary: 'Fresh topic.',
      new_topic: true,
      trigger_files: ['src/**'],
    });
    expect(r.isNewTopic).toBe(true);
    const graph = loadLessonsGraph(projectRoot);
    expect(graph.topics['fresh']?.summary).toBe('Fresh topic.');
  });

  it('rejects an add with no triggers (unreachable lesson)', async () => {
    await expect(
      lessonsHandlers.add(ctx, { rule: 'No triggers at all.', topic: 'topic-x' }),
    ).rejects.toThrow(/at least one trigger/i);
  });

  it('accepts command and keyword trigger arrays alongside files', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'All trigger kinds.',
      topic: 'topic-x',
      trigger_files: ['src/**'],
      trigger_commands: ['^pnpm test'],
      trigger_keywords: ['windows'],
    });
    expect(loadLessonsGraph(projectRoot).lessons[r.id]?.triggers.length).toBe(3);
  });

  it('rethrows non-UnknownTopicError failures (e.g. new_topic without topic_summary)', async () => {
    await expect(
      lessonsHandlers.add(ctx, {
        rule: 'X.',
        topic: 'brand-new',
        new_topic: true,
        trigger_files: ['src/**'],
      }),
    ).rejects.toThrow(/topicSummary/i);
  });

  it('is idempotent on repeat with same rule + topic', async () => {
    const a = await lessonsHandlers.add(ctx, {
      rule: 'Idempotent rule.',
      topic: 'topic-x',
      trigger_files: ['src/**'],
    });
    const b = await lessonsHandlers.add(ctx, {
      rule: 'Idempotent rule.',
      topic: 'topic-x',
      trigger_files: ['src/**'],
    });
    expect(b.id).toBe(a.id);
    expect(b.isNewLesson).toBe(false);
  });
});

describe('lessonsHandlers.add — input coercion + CLI-flag aliases', () => {
  it('coerces a scalar trigger_files string into a single trigger', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'Scalar trigger.',
      topic: 'topic-x',
      trigger_files: 'src/scalar/**',
    });
    expect(loadLessonsGraph(projectRoot).lessons[r.id]?.triggers.length).toBe(1);
  });

  it('never comma-splits a trigger pattern (globs/regexes contain commas)', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'Brace glob.',
      topic: 'topic-x',
      trigger_files: 'src/{a,b}/**',
    });
    const graph = loadLessonsGraph(projectRoot);
    const ids = graph.lessons[r.id]?.triggers ?? [];
    expect(ids.length).toBe(1);
    expect(graph.triggers[ids[0]!]?.pattern).toBe('src/{a,b}/**');
  });

  it('comma-splits a scalar evidence string like the CLI', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'Multi evidence.',
      topic: 'topic-x',
      trigger_files: 'src/**',
      evidence: 'commit:a, lesson:b',
    });
    expect(loadLessonsGraph(projectRoot).lessons[r.id]?.evidence).toEqual(['commit:a', 'lesson:b']);
  });

  it('rejects an empty-string trigger as no trigger (unreachable lesson)', async () => {
    await expect(
      lessonsHandlers.add(ctx, {
        rule: 'Empty trigger string.',
        topic: 'topic-x',
        trigger_files: '',
      }),
    ).rejects.toThrow(/at least one trigger/i);
  });

  it('accepts the CLI-flag aliases trigger_file / trigger_cmd / trigger_kw', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'Aliased triggers.',
      topic: 'topic-x',
      trigger_file: 'src/**',
      trigger_cmd: '^pnpm test',
      trigger_kw: 'windows',
    });
    expect(loadLessonsGraph(projectRoot).lessons[r.id]?.triggers.length).toBe(3);
  });

  it('prefers the canonical plural field over the singular alias when both are present', async () => {
    const r = await lessonsHandlers.add(ctx, {
      rule: 'Canonical wins.',
      topic: 'topic-x',
      trigger_files: ['src/canon/**'],
      trigger_file: 'src/ignored/**',
    });
    const graph = loadLessonsGraph(projectRoot);
    const ids = graph.lessons[r.id]?.triggers ?? [];
    expect(ids.length).toBe(1);
    expect(graph.triggers[ids[0]!]?.pattern).toBe('src/canon/**');
  });
});

describe('lessonsHandlers.show', () => {
  it('returns the topic summary and its lessons with status + metadata', async () => {
    const r = await lessonsHandlers.show(ctx, { topic: 'topic-x' });
    expect(r.topic).toBe('topic-x');
    expect(r.summary).toBe('Topic X.');
    expect(r.lessons).toEqual([
      {
        id: 'topic-x-rule-1',
        rule: 'Normalize CLI paths.',
        status: 'active',
        topics: ['topic-x'],
        triggers: ['t-glob'],
        evidence: [],
      },
    ]);
  });

  it('throws on an unknown topic', async () => {
    await expect(lessonsHandlers.show(ctx, { topic: 'ghost' })).rejects.toThrow(/unknown topic/i);
  });
});

describe('lessonsHandlers.deprecate', () => {
  it('flips a lesson to deprecated and excludes it from subsequent recall', async () => {
    const before = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(before.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);

    const r = await lessonsHandlers.deprecate(ctx, { id: 'topic-x-rule-1' });
    expect(r).toEqual({ id: 'topic-x-rule-1', status: 'deprecated', supersededBy: null });
    expect(loadLessonsGraph(projectRoot).lessons['topic-x-rule-1']?.status).toBe('deprecated');

    const after = await lessonsHandlers.query(ctx, { file: 'src/cli/x.ts' });
    expect(after.lessons).toEqual([]);
  });

  it('supersedes a lesson when superseded_by points at another lesson', async () => {
    await lessonsHandlers.add(ctx, {
      rule: 'The replacement rule.',
      topic: 'topic-x',
      trigger_files: ['src/cli/**/*.ts'],
    });
    const replacement = loadLessonsGraph(projectRoot);
    const replacementId = Object.keys(replacement.lessons).find((id) => id !== 'topic-x-rule-1');
    const r = await lessonsHandlers.deprecate(ctx, {
      id: 'topic-x-rule-1',
      superseded_by: replacementId,
    });
    expect(r.status).toBe('superseded');
    expect(r.supersededBy).toBe(replacementId);
    expect(loadLessonsGraph(projectRoot).lessons['topic-x-rule-1']?.supersededBy).toBe(
      replacementId,
    );
  });

  it('throws on an unknown lesson id', async () => {
    await expect(lessonsHandlers.deprecate(ctx, { id: 'nope' })).rejects.toThrow(/unknown lesson/i);
  });
});

/** Capture the error a rejecting promise throws, asserting it is an McpError. */
async function captureMcpError(p: Promise<unknown>): Promise<McpError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof McpError) return e;
    throw new Error(
      `expected McpError, got ${e instanceof Error ? e.name : typeof e}: ${String(e)}`,
      { cause: e },
    );
  }
  throw new Error('expected the promise to reject, but it resolved');
}

describe('lessonsHandlers — error codes (no IO_ERROR mislabel)', () => {
  it('query with no predicate is VALIDATION_FAILED', async () => {
    const err = await captureMcpError(lessonsHandlers.query(ctx, {}));
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toMatch(/at least one of file, command, keyword/i);
  });

  it('query with always=true and no predicate returns the always-on lessons', async () => {
    await lessonsHandlers.add(ctx, {
      rule: 'Write comments per the repo style.',
      topic: 'style',
      new_topic: true,
      topic_summary: 'Style.',
      scope: 'always',
    });
    const r = await lessonsHandlers.query(ctx, { always: true });
    expect(r.lessons.some((l) => l.rule === 'Write comments per the repo style.')).toBe(true);
  });

  it('add to an unknown topic is NOT_FOUND with UNKNOWN_TOPIC machine code', async () => {
    const err = await captureMcpError(
      lessonsHandlers.add(ctx, {
        rule: 'rejected.',
        topic: 'ghost-topic',
        trigger_files: ['src/**/*.ts'],
      }),
    );
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toMatch(/unknown topic/i);
    expect((err.details as { code?: string }).code).toBe('UNKNOWN_TOPIC');
  });

  it('add with no triggers is VALIDATION_FAILED with NO_TRIGGER machine code', async () => {
    const err = await captureMcpError(
      lessonsHandlers.add(ctx, { rule: 'no triggers.', topic: 'topic-x' }),
    );
    expect(err.code).toBe('VALIDATION_FAILED');
    expect((err.details as { code?: string }).code).toBe('NO_TRIGGER');
  });

  it('add of an unrecallable lesson is VALIDATION_FAILED with UNRECALLABLE_LESSON machine code', async () => {
    const err = await captureMcpError(
      lessonsHandlers.add(ctx, {
        rule: 'every trigger dead.',
        topic: 'topic-x',
        trigger_keywords: ['the of and'],
      }),
    );
    expect(err.code).toBe('VALIDATION_FAILED');
    expect((err.details as { code?: string }).code).toBe('UNRECALLABLE_LESSON');
  });

  it('add of an oversized rule is VALIDATION_FAILED with OVERSIZED_RULE machine code', async () => {
    const err = await captureMcpError(
      lessonsHandlers.add(ctx, {
        rule: 'x'.repeat(2001),
        topic: 'topic-x',
        trigger_files: ['src/**/*.ts'],
      }),
    );
    expect(err.code).toBe('VALIDATION_FAILED');
    expect((err.details as { code?: string }).code).toBe('OVERSIZED_RULE');
  });

  it('add with new_topic but no topic_summary rethrows the underlying error (not swallowed)', async () => {
    await expect(
      lessonsHandlers.add(ctx, {
        rule: 'missing summary.',
        topic: 'brand-new',
        new_topic: true,
        trigger_files: ['src/**/*.ts'],
      }),
    ).rejects.toThrow(/topicSummary/i);
  });

  it('show of an unknown topic is NOT_FOUND', async () => {
    const err = await captureMcpError(lessonsHandlers.show(ctx, { topic: 'ghost' }));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toMatch(/unknown topic/i);
  });

  it('deprecate of an unknown lesson id is NOT_FOUND', async () => {
    const err = await captureMcpError(lessonsHandlers.deprecate(ctx, { id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toMatch(/unknown lesson/i);
  });

  it('deprecate with an unknown superseder is NOT_FOUND', async () => {
    const err = await captureMcpError(
      lessonsHandlers.deprecate(ctx, { id: 'topic-x-rule-1', superseded_by: 'no-such-lesson' }),
    );
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toMatch(/unknown superseder/i);
  });
});

describe('lessonsHandlers.add — rule-shape and breadth rejections', () => {
  it('whitespace-only rule is VALIDATION_FAILED with EMPTY_RULE machine code', async () => {
    const err = await captureMcpError(
      lessonsHandlers.add(ctx, { rule: '   ', topic: 'topic-x', trigger_files: ['src/**/*.ts'] }),
    );
    expect(err.code).toBe('VALIDATION_FAILED');
    expect((err.details as { code?: string }).code).toBe('EMPTY_RULE');
    expect(err.message).toMatch(/rule must not be empty/i);
  });

  it('over-broad command pattern is VALIDATION_FAILED with BROAD_COMMAND_PATTERN machine code', async () => {
    const err = await captureMcpError(
      lessonsHandlers.add(ctx, {
        rule: 'Never do the thing.',
        topic: 'topic-x',
        trigger_cmd: '.*',
      }),
    );
    expect(err.code).toBe('VALIDATION_FAILED');
    expect((err.details as { code?: string }).code).toBe('BROAD_COMMAND_PATTERN');
  });
});
