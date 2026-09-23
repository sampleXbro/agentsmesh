import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { LESSONS_SUBCOMMANDS } from '../../../../src/cli/commands/lessons-usage.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { appendOutcomeEvent, type OutcomeEvent } from '../../../../src/lessons/outcome-log.js';
import { clearSeen } from '../../../../src/lessons/seen-cache.js';
import { readRecallLog } from '../../../../src/lessons/telemetry.js';
import { DEFAULT_RECALL_MAX_TOKENS } from '../../../../src/lessons/ranking.js';
import { commitAll, git, initRepo, writeFile } from '../../../helpers/temp-git-repo.js';

const TELEMETRY_ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;
const failEvent = (contextKey: string): OutcomeEvent => ({
  ts: '2026-01-01T00:00:00Z',
  kind: 'failure',
  contextKey,
  session: 's',
});
const deliveredEvent = (lessonId: string, contextKey: string): OutcomeEvent => ({
  ts: '2026-01-01T00:00:00Z',
  kind: 'delivered',
  lessonId,
  contextKey,
  session: 's',
});

/** Persist a graph WITHOUT canonicalizing, preserving the literal key order so
 * the handlers' deterministic id/createdAt sorts receive unsorted input. */
function writeRawGraph(root: string, graph: LessonsGraph): void {
  const path = graphFilePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
}

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY_FIXTURE = join(HERE, '../../../fixtures/lessons/legacy-input');

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-cli-lessons-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function seedSimpleGraph(): void {
  const graph: LessonsGraph = {
    version: 1,
    lessons: {
      'topic-x-rule-1': {
        rule: 'Normalize display paths.',
        topics: ['topic-x'],
        triggers: ['t-glob-src'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-05',
      },
    },
    topics: { 'topic-x': { summary: 'Topic X.' } },
    triggers: { 't-glob-src': { kind: 'file_glob', pattern: 'src/**/*.ts' } },
  };
  saveLessonsGraph(root, graph);
}

describe('runLessons — help / unknown', () => {
  it('returns showHelp when no subcommand is given', async () => {
    const r = await runLessons({}, [], root);
    expect(r.subcommand).toBe('help');
    expect(r.exitCode).toBe(0);
  });

  it('returns error + showHelp for an unknown subcommand', async () => {
    const r = await runLessons({}, ['banana'], root);
    expect(r.subcommand).toBe('help');
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('banana');
  });

  it('rejects an unknown flag before dispatching (exit 2, names the flag)', async () => {
    const r = await runLessons({ fil: 'src/a.ts' }, ['query'], root);
    expect(r.subcommand).toBe('help');
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('--fil');
  });

  it('rejects a typoed trigger flag on add (the silent-data-loss case)', async () => {
    const r = await runLessons({ 'trigger-flie': 'src/**' }, ['add', 'x'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('--trigger-flie');
  });
});

describe('runLessons — internal subcommands (hook / merge-driver)', () => {
  it('routes `hook` to the hook handler and emits nothing on a TTY (no payload)', async () => {
    const original = process.stdin.isTTY;
    process.stdin.isTTY = true;
    try {
      const r = await runLessons({}, ['hook'], root);
      expect(r.subcommand).toBe('hook');
      if (r.subcommand !== 'hook') return;
      expect(r.data.output).toBe('');
      expect(r.exitCode).toBe(0);
    } finally {
      process.stdin.isTTY = original;
    }
  });

  it('routes `merge-driver` to its handler and fails cleanly on missing args', async () => {
    const r = await runLessons({}, ['merge-driver'], root);
    expect(r.subcommand).toBe('merge-driver');
    expect(r.exitCode).toBe(1);
  });
});

describe('runLessons untrigger — argument validation', () => {
  it('errors (exit 2) when the trigger id is missing', async () => {
    const r = await runLessons({}, ['untrigger', 'rule-a'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/untrigger <lesson-id> <trigger-id>/);
  });

  it('errors (exit 2) when the lesson id is empty', async () => {
    const r = await runLessons({}, ['untrigger', '', 't-1'], root);
    expect(r.exitCode).toBe(2);
  });
});

describe('runLessons — dispatcher matches the canonical subcommand list', () => {
  // Ties LESSONS_SUBCOMMANDS (the source every help surface derives from) to the
  // real routing: each canonical subcommand must dispatch to its own handler
  // (subcommand echoed back, never the `help` fallthrough), and only those do.
  it('routes every LESSONS_SUBCOMMANDS entry to its own handler', async () => {
    for (const sub of LESSONS_SUBCOMMANDS) {
      const r = await runLessons({}, [sub], root);
      expect(r.subcommand).toBe(sub);
    }
  });

  it('does not route a subcommand absent from the canonical list', async () => {
    const r = await runLessons({}, ['not-a-real-subcommand'], root);
    expect(r.subcommand).toBe('help');
    expect(r.exitCode).toBe(2);
  });
});

describe('runLessons query', () => {
  it('returns matching lesson ids in alphabetical order', async () => {
    seedSimpleGraph();
    const r = await runLessons({ file: 'src/cli/lessons.ts' }, ['query'], root);
    expect(r.subcommand).toBe('query');
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
    expect(r.data.lessons[0]?.rule).toBe('Normalize display paths.');
  });

  it('--always returns the always-on lessons with no predicate', async () => {
    seedSimpleGraph();
    await runLessons(
      { rule: 'Write comments per the repo style.', topic: 'topic-x', scope: 'always' },
      ['add'],
      root,
    );
    const r = await runLessons({ always: true }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.lessons.some((l) => l.rule === 'Write comments per the repo style.')).toBe(true);
  });

  it('honors --format plain | md | json', async () => {
    seedSimpleGraph();
    const plain = await runLessons({ file: 'src/x.ts', format: 'plain' }, ['query'], root);
    const md = await runLessons({ file: 'src/x.ts', format: 'md' }, ['query'], root);
    const json = await runLessons({ file: 'src/x.ts', format: 'json' }, ['query'], root);
    if (plain.subcommand !== 'query' || md.subcommand !== 'query' || json.subcommand !== 'query')
      return;
    expect(plain.format).toBe('plain');
    expect(md.format).toBe('md');
    expect(json.format).toBe('json');
  });

  it('rejects a query with no predicate (exit 2)', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['query'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/--file|--cmd|--keyword/);
  });

  it('warns on keyword-only recall (no --file/--cmd) but still returns results', async () => {
    seedSimpleGraph();
    const r = await runLessons({ keyword: 'paths' }, ['query'], root);
    expect(r.subcommand).toBe('query');
    if (r.subcommand !== 'query') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.warning).toMatch(/keyword-only/i);
    expect(r.data.warning).toMatch(/--file/);
  });

  it('sets showIds on the data when --ids is passed with matches', async () => {
    seedSimpleGraph();
    const r = await runLessons({ file: 'src/cli/lessons.ts', ids: true }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.showIds).toBe(true);
    expect(r.data.lessons.length).toBeGreaterThan(0);
  });

  it('rejects an invalid --format value with a usage error (exit 2)', async () => {
    seedSimpleGraph();
    const r = await runLessons({ file: 'src/x.ts', format: 'xml' }, ['query'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/--format/);
  });

  it('returns empty (not error) when lessons.json is missing and no legacy index exists', async () => {
    const r = await runLessons({ file: 'src/x.ts' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  it('hints at `init --lessons` when no graph exists (lessons never set up)', async () => {
    const r = await runLessons({ file: 'src/x.ts' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.warning).toMatch(/init --lessons/);
  });

  it('stays in a subdir whose ancestor has a bare .agentsmesh but no lessons graph', async () => {
    mkdirSync(join(root, '.agentsmesh'), { recursive: true }); // global-mode style, no lessons/
    const sub = join(root, 'packages', 'app');
    mkdirSync(sub, { recursive: true });
    const r = await runLessons({ file: 'src/x.ts' }, ['query'], sub);
    if (r.subcommand !== 'query') throw new Error('expected query');
    // The bare .agentsmesh is not a lessons project: recall stays at the subdir.
    expect(r.data.warning).toMatch(/init --lessons/);
  });

  it('warns when config.json is present but malformed (still returns results)', async () => {
    seedSimpleGraph();
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(join(root, '.agentsmesh/lessons/config.json'), 'not json');
    const r = await runLessons({ file: 'src/x.ts' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.lessons.length).toBeGreaterThan(0);
    expect(r.data.warning).toMatch(/config\.json/);
  });

  it('auto-migrates from legacy index.yaml on first query and DELETES legacy artifacts', async () => {
    cpSync(LEGACY_FIXTURE, join(root, '.agentsmesh/lessons'), { recursive: true });
    expect(existsSync(join(root, '.agentsmesh/lessons/lessons.json'))).toBe(false);

    const r = await runLessons({ keyword: 'alpha' }, ['query'], root);
    expect(existsSync(join(root, '.agentsmesh/lessons/lessons.json'))).toBe(true);
    // Clean-break: legacy files are gone after auto-migration.
    expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(false);
    expect(existsSync(join(root, '.agentsmesh/lessons/journal.md'))).toBe(false);
    expect(existsSync(join(root, '.agentsmesh/lessons/topics'))).toBe(false);

    if (r.subcommand !== 'query') return;
    expect(r.data.autoMigrated).toBe(true);
    expect(r.data.lessons.length).toBeGreaterThan(0);
  });

  it('matches a file_glob lesson when --file is an absolute path', async () => {
    seedSimpleGraph();
    const r = await runLessons({ file: join(root, 'src/cli/lessons.ts') }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
  });

  it('matches a file_glob lesson when --file is ./-prefixed', async () => {
    seedSimpleGraph();
    const r = await runLessons({ file: './src/cli/lessons.ts' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
  });

  it('degrades to empty + a warning (exit 0) when lessons.json is corrupt instead of crashing', async () => {
    mkdirSync(dirname(graphFilePath(root)), { recursive: true });
    writeFileSync(graphFilePath(root), '{ truncated', 'utf8');
    const r = await runLessons({ file: 'src/x.ts' }, ['query'], root);
    expect(r.subcommand).toBe('query');
    if (r.subcommand !== 'query') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.lessons).toEqual([]);
    expect(r.data.warning).toMatch(/^recall returned no lessons: .* could not be parsed/);
  });

  it('degrades with an upgrade hint (not "corrupt") when lessons.json is a newer version', async () => {
    mkdirSync(dirname(graphFilePath(root)), { recursive: true });
    writeFileSync(
      graphFilePath(root),
      JSON.stringify({ version: 99, lessons: {}, topics: {}, triggers: {} }),
      'utf8',
    );
    const r = await runLessons({ file: 'src/x.ts' }, ['query'], root);
    expect(r.subcommand).toBe('query');
    if (r.subcommand !== 'query') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.lessons).toEqual([]);
    expect(r.data.warning).toMatch(/^recall returned no lessons: .* is version 99, newer/);
    expect(r.data.warning ?? '').not.toMatch(/corrupt/i);
  });
});

describe('runLessons add', () => {
  it('adds a lesson and returns its id', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      {
        rule: 'Strip CRLF from emitted scripts.',
        topic: 'topic-x',
        'trigger-file': 'src/**/*.ts',
        evidence: 'commit:xyz',
      },
      ['add'],
      root,
    );
    expect(r.subcommand).toBe('add');
    if (r.subcommand !== 'add') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.id).toMatch(/^topic-x-/);
    expect(r.data.isNewLesson).toBe(true);

    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.data.id]?.rule).toBe('Strip CRLF from emitted scripts.');
  });

  it('captures an always-on lesson via --scope always with no trigger', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      { rule: 'Write comments per the repo style.', topic: 'topic-x', scope: 'always' },
      ['add'],
      root,
    );
    if (r.subcommand !== 'add') return;
    expect(r.exitCode).toBe(0);
    expect(loadLessonsGraph(root).lessons[r.data.id]?.scope).toBe('always');
  });

  it('rejects --scope other than always', async () => {
    seedSimpleGraph();
    const r = await runLessons({ rule: 'X.', topic: 'topic-x', scope: 'sometimes' }, ['add'], root);
    if (r.subcommand !== 'add') return;
    expect(r.exitCode).not.toBe(0);
  });

  it('warns recall is not wired when capturing without `init --lessons` (graph-only)', async () => {
    seedSimpleGraph(); // writes lessons.json but no config.json → not activated
    const r = await runLessons(
      { rule: 'A new rule.', topic: 'topic-x', 'trigger-file': 'src/**/*.ts' },
      ['add'],
      root,
    );
    if (r.subcommand !== 'add') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.activationNote).toMatch(/init --lessons/);
  });

  it('does NOT warn when lessons is activated (config.json present)', async () => {
    seedSimpleGraph();
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(join(root, '.agentsmesh/lessons/config.json'), '{"recallLimit":10}');
    const r = await runLessons(
      { rule: 'Another rule.', topic: 'topic-x', 'trigger-file': 'src/**/*.ts' },
      ['add'],
      root,
    );
    if (r.subcommand !== 'add') return;
    expect(r.data.activationNote).toBeUndefined();
  });

  it('accepts the rule as a positional arg (the documented `add "<rule>" --topic` form)', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      { topic: 'topic-x', 'trigger-file': 'src/**' },
      ['add', 'Positional rule body.'],
      root,
    );
    expect(r.subcommand).toBe('add');
    if (r.subcommand !== 'add') return;
    expect(r.exitCode).toBe(0);
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.data.id]?.rule).toBe('Positional rule body.');
  });

  it('prefers --rule over the positional arg when both are supplied', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      { topic: 'topic-x', rule: 'Flag rule.', 'trigger-file': 'src/**' },
      ['add', 'Positional rule.'],
      root,
    );
    if (r.subcommand !== 'add') return;
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.data.id]?.rule).toBe('Flag rule.');
  });

  it('errors when --rule or --topic is missing', async () => {
    seedSimpleGraph();
    const noRule = await runLessons({ topic: 'topic-x' }, ['add'], root);
    expect(noRule.exitCode).toBe(2);
    expect(noRule.error).toMatch(/rule/i);
    const noTopic = await runLessons({ rule: 'X.' }, ['add'], root);
    expect(noTopic.exitCode).toBe(2);
    expect(noTopic.error).toMatch(/topic/i);
  });

  it('rejects a lone invalid command regex as UNRECALLABLE_LESSON with exit 2', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      { rule: 'Bad regex rule.', topic: 'topic-x', 'trigger-cmd': '(' },
      ['add'],
      root,
    );
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/no effective trigger/);
    expect(r.error).toMatch(/invalid regex/);
  });

  it('rejects unknown topic without --new-topic', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      { rule: 'R.', topic: 'nope', 'trigger-file': 'src/**' },
      ['add'],
      root,
    );
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/unknown topic/i);
  });

  it('creates a topic with --new-topic + --topic-summary', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      {
        rule: 'R.',
        topic: 'fresh-topic',
        'trigger-file': 'src/**',
        'new-topic': true,
        'topic-summary': 'Fresh topic.',
      },
      ['add'],
      root,
    );
    expect(r.exitCode).toBe(0);
    if (r.subcommand !== 'add') return;
    expect(r.data.isNewTopic).toBe(true);
  });

  it('treats a trigger value as opaque — commas in a glob/regex are NOT split', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      {
        rule: 'Brace glob trigger rule.',
        topic: 'topic-x',
        'trigger-file': 'src/{a,b}/**',
        'trigger-cmd': '^foo{1,3}$',
      },
      ['add'],
      root,
    );
    expect(r.exitCode).toBe(0);
    if (r.subcommand !== 'add') return;
    const graph = loadLessonsGraph(root);
    const lesson = graph.lessons[r.data.id];
    expect(lesson?.triggers.length).toBe(2);
    const patterns = lesson?.triggers.map((t) => graph.triggers[t]?.pattern).sort();
    expect(patterns).toEqual(['^foo{1,3}$', 'src/{a,b}/**']);
  });

  it('accepts repeated --trigger-file/--trigger-cmd/--trigger-kw and --evidence', async () => {
    seedSimpleGraph();
    const r = await runLessons(
      {
        rule: 'Multi-trigger rule.',
        topic: 'topic-x',
        'trigger-file': ['src/**', 'tests/**'],
        'trigger-cmd': '^pnpm test',
        'trigger-kw': ['display', 'path'],
        evidence: ['commit:a', 'commit:b'],
      } as unknown as Record<string, string | boolean>,
      ['add'],
      root,
    );
    expect(r.exitCode).toBe(0);
    if (r.subcommand !== 'add') return;
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.data.id]?.triggers.length).toBe(5);
    expect(graph.lessons[r.data.id]?.evidence.length).toBe(2);
  });
});

describe('runLessons topics', () => {
  it('lists every topic with summary', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['topics'], root);
    if (r.subcommand !== 'topics') return;
    expect(r.data.topics).toEqual([{ id: 'topic-x', summary: 'Topic X.' }]);
  });

  it('hints at `init --lessons` when the subsystem is not activated', async () => {
    const r = await runLessons({}, ['topics'], root);
    if (r.subcommand !== 'topics') return;
    expect(r.data.setupHint).toMatch(/init --lessons/);
  });

  it('omits the setup hint once lessons is activated (config.json present)', async () => {
    seedSimpleGraph();
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(join(root, '.agentsmesh/lessons/config.json'), '{"recallLimit":10}');
    const r = await runLessons({}, ['topics'], root);
    if (r.subcommand !== 'topics') return;
    expect(r.data.setupHint).toBeUndefined();
  });

  it('sorts topics by id regardless of insertion order', async () => {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {},
      topics: { 'z-t': { summary: 'Z.' }, 'a-t': { summary: 'A.' }, 'm-t': { summary: 'M.' } },
      triggers: {},
    };
    saveLessonsGraph(root, graph);
    const r = await runLessons({}, ['topics'], root);
    if (r.subcommand !== 'topics') return;
    expect(r.data.topics.map((t) => t.id)).toEqual(['a-t', 'm-t', 'z-t']);
  });

  it('returns no topics on a project without a graph', async () => {
    const r = await runLessons({}, ['topics'], root);
    if (r.subcommand !== 'topics') return;
    expect(r.data.topics).toEqual([]);
  });

  it('sorts topics ascending even when persisted in descending order', async () => {
    writeRawGraph(root, {
      version: 1,
      lessons: {},
      topics: { 'z-t': { summary: 'Z.' }, 'm-t': { summary: 'M.' }, 'a-t': { summary: 'A.' } },
      triggers: {},
    });
    const r = await runLessons({}, ['topics'], root);
    if (r.subcommand !== 'topics') return;
    expect(r.data.topics.map((t) => t.id)).toEqual(['a-t', 'm-t', 'z-t']);
  });
});

describe('runLessons journal', () => {
  it('returns no entries on a project without a graph', async () => {
    const r = await runLessons({}, ['journal'], root);
    if (r.subcommand !== 'journal') return;
    expect(r.data.entries).toEqual([]);
  });

  it('hints at `init --lessons` when the subsystem is not activated', async () => {
    const r = await runLessons({}, ['journal'], root);
    if (r.subcommand !== 'journal') return;
    expect(r.data.setupHint).toMatch(/init --lessons/);
  });

  it('omits the setup hint once lessons is activated (config.json present)', async () => {
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(join(root, '.agentsmesh/lessons/config.json'), '{"recallLimit":10}');
    const r = await runLessons({}, ['journal'], root);
    if (r.subcommand !== 'journal') return;
    expect(r.data.setupHint).toBeUndefined();
  });

  it('breaks createdAt ties by lesson id', async () => {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'b-two': {
          rule: 'B.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'a-one': {
          rule: 'A.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: '.' } },
      triggers: {},
    };
    saveLessonsGraph(root, graph);
    const r = await runLessons({}, ['journal'], root);
    if (r.subcommand !== 'journal') return;
    expect(r.data.entries.map((e) => e.id)).toEqual(['a-one', 'b-two']);
  });

  it('marks deprecated and superseded lessons', async () => {
    const lesson = (rule: string): LessonsGraph['lessons'][string] => ({
      rule,
      topics: ['t'],
      triggers: [],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    });
    saveLessonsGraph(root, {
      version: 2,
      lessons: {
        'a-live': lesson('A.'),
        'b-gone': { ...lesson('B.'), status: 'deprecated' },
        'c-old': { ...lesson('C.'), status: 'superseded', supersededBy: 'a-live' },
      },
      topics: { t: { summary: '.' } },
      triggers: {},
    });
    const r = await runLessons({}, ['journal'], root);
    if (r.subcommand !== 'journal') throw new Error('expected journal');
    expect(
      r.data.entries.map(({ id, status, supersededBy }) => ({ id, status, supersededBy })),
    ).toEqual([
      { id: 'a-live', status: 'active', supersededBy: undefined },
      { id: 'b-gone', status: 'deprecated', supersededBy: undefined },
      { id: 'c-old', status: 'superseded', supersededBy: 'a-live' },
    ]);
  });
});

describe('runLessons show — multiple lessons', () => {
  it('renders active lessons in a topic sorted by id', async () => {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'topic-x-rule-2': {
          rule: 'Second.',
          topics: ['topic-x'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'topic-x-rule-1': {
          rule: 'First.',
          topics: ['topic-x'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'topic-x-rule-3': {
          rule: 'Deprecated.',
          topics: ['topic-x'],
          triggers: [],
          evidence: [],
          status: 'deprecated',
          createdAt: '2026-06-01',
        },
      },
      topics: { 'topic-x': { summary: 'Topic X.' } },
      triggers: {},
    };
    saveLessonsGraph(root, graph);
    const r = await runLessons({}, ['show', 'topic-x'], root);
    if (r.subcommand !== 'show') return;
    expect(r.data.markdown.indexOf('topic-x-rule-1')).toBeLessThan(
      r.data.markdown.indexOf('topic-x-rule-2'),
    );
    // Deprecated lessons are excluded from the rendered topic.
    expect(r.data.markdown).not.toContain('topic-x-rule-3');
  });
});

describe('runLessons show — ordering', () => {
  it('renders lessons in ascending id order even when persisted descending', async () => {
    const mk = (rule: string): LessonsGraph['lessons'][string] => ({
      rule,
      topics: ['topic-x'],
      triggers: [],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    });
    writeRawGraph(root, {
      version: 1,
      lessons: {
        'topic-x-rule-3': mk('Third.'),
        'topic-x-rule-2': mk('Second.'),
        'topic-x-rule-1': mk('First.'),
      },
      topics: { 'topic-x': { summary: 'X.' } },
      triggers: {},
    });
    const r = await runLessons({}, ['show', 'topic-x'], root);
    if (r.subcommand !== 'show') return;
    const md = r.data.markdown;
    expect(md.indexOf('topic-x-rule-1')).toBeLessThan(md.indexOf('topic-x-rule-2'));
    expect(md.indexOf('topic-x-rule-2')).toBeLessThan(md.indexOf('topic-x-rule-3'));
  });
});

describe('runLessons show', () => {
  it('excludes lessons that belong to other topics', async () => {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'x-1': {
          rule: 'Belongs to X.',
          topics: ['topic-x'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'y-1': {
          rule: 'Belongs to Y.',
          topics: ['topic-y'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { 'topic-x': { summary: 'X.' }, 'topic-y': { summary: 'Y.' } },
      triggers: {},
    };
    saveLessonsGraph(root, graph);
    const r = await runLessons({}, ['show', 'topic-x'], root);
    if (r.subcommand !== 'show') return;
    expect(r.data.markdown).toContain('Belongs to X.');
    expect(r.data.markdown).not.toContain('Belongs to Y.');
  });

  it('renders a topic as markdown listing its lessons', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['show', 'topic-x'], root);
    if (r.subcommand !== 'show') return;
    expect(r.data.subject).toBe('topic-x');
    expect(r.data.markdown).toContain('topic-x');
    expect(r.data.markdown).toContain('Normalize display paths.');
  });

  it('shows a single lesson by id, resolving its triggers to patterns', async () => {
    seedSimpleGraph(); // lesson topic-x-rule-1 with trigger t-glob-src = src/**/*.ts
    const r = await runLessons({}, ['show', 'topic-x-rule-1'], root);
    if (r.subcommand !== 'show') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.subject).toBe('topic-x-rule-1');
    expect(r.data.markdown).toContain('Normalize display paths.');
    expect(r.data.markdown).toContain('**status:** active');
    // The trigger id resolves to its kind + pattern — the diagnosis the view exists for.
    expect(r.data.markdown).toContain('t-glob-src');
    expect(r.data.markdown).toContain('[file_glob] src/**/*.ts');
  });

  it('errors with a helpful hint when neither a topic nor a lesson id matches', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['show', 'nope'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/unknown topic or lesson/i);
    expect(r.error).toMatch(/journal/);
  });
});

describe('runLessons deprecate', () => {
  it('marks the lesson deprecated', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['deprecate', 'topic-x-rule-1'], root);
    if (r.subcommand !== 'deprecate') return;
    expect(r.exitCode).toBe(0);
    const graph = loadLessonsGraph(root);
    expect(graph.lessons['topic-x-rule-1']?.status).toBe('deprecated');
  });

  it('marks superseded with --superseded-by', async () => {
    seedSimpleGraph();
    const graph = loadLessonsGraph(root);
    graph.lessons['topic-x-rule-2'] = {
      ...graph.lessons['topic-x-rule-1']!,
      rule: 'Replacement rule.',
    };
    saveLessonsGraph(root, graph);

    const r = await runLessons(
      { 'superseded-by': 'topic-x-rule-2' },
      ['deprecate', 'topic-x-rule-1'],
      root,
    );
    expect(r.exitCode).toBe(0);
    const reloaded = loadLessonsGraph(root);
    expect(reloaded.lessons['topic-x-rule-1']?.status).toBe('superseded');
    expect(reloaded.lessons['topic-x-rule-1']?.supersededBy).toBe('topic-x-rule-2');
  });

  it('errors with usage when no lesson id is given', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['deprecate'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/usage/i);
  });

  it('errors on an unknown lesson id', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['deprecate', 'ghost'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/unknown lesson/i);
  });

  it('errors when --superseded-by points at a missing lesson', async () => {
    seedSimpleGraph();
    const r = await runLessons({ 'superseded-by': 'ghost' }, ['deprecate', 'topic-x-rule-1'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/unknown superseder/i);
  });
});

describe('runLessons query — session dedup', () => {
  const seenFiles: string[] = [];
  afterEach(() => {
    for (const id of seenFiles.splice(0)) {
      // Explicit CLI sessions are project-namespaced now; clean both shapes.
      rmSync(join(tmpdir(), 'agentsmesh-lessons-seen', `${id}.json`), { force: true });
      clearSeen(id, root);
    }
  });

  it('suppresses a lesson already delivered this session, restored by --no-dedup', async () => {
    seedSimpleGraph();
    const session = `cli-${process.pid}-${seenFiles.length}-dedup`;
    seenFiles.push(session);

    const r1 = await runLessons({ file: 'src/a.ts', session }, ['query'], root);
    if (r1.subcommand !== 'query') throw new Error('expected query');
    expect(r1.data.lessons).toHaveLength(1);
    expect(r1.data.suppressed).toBeUndefined();

    const r2 = await runLessons({ file: 'src/a.ts', session }, ['query'], root);
    if (r2.subcommand !== 'query') throw new Error('expected query');
    expect(r2.data.lessons).toHaveLength(0);
    expect(r2.data.suppressed).toBe(1);

    const r3 = await runLessons({ file: 'src/a.ts', session, 'no-dedup': true }, ['query'], root);
    if (r3.subcommand !== 'query') throw new Error('expected query');
    expect(r3.data.lessons).toHaveLength(1);
  });
});

describe('runLessons query — --session auto', () => {
  let prevSession: string | undefined;
  beforeEach(() => {
    prevSession = process.env.AGENTSMESH_SESSION_ID;
    delete process.env.AGENTSMESH_SESSION_ID;
  });
  afterEach(() => {
    if (prevSession === undefined) delete process.env.AGENTSMESH_SESSION_ID;
    else process.env.AGENTSMESH_SESSION_ID = prevSession;
    // Auto sessions are project-namespaced; root is unique per test, but clean anyway.
    clearSeen(`auto-${new Date().toISOString().slice(0, 10)}`, root);
  });

  it('derives a project-scoped day session: repeat suppressed, --no-dedup restores', async () => {
    seedSimpleGraph();
    const r1 = await runLessons({ file: 'src/a.ts', session: 'auto' }, ['query'], root);
    if (r1.subcommand !== 'query') throw new Error('expected query');
    expect(r1.data.lessons).toHaveLength(1);

    const r2 = await runLessons({ file: 'src/a.ts', session: 'auto' }, ['query'], root);
    if (r2.subcommand !== 'query') throw new Error('expected query');
    expect(r2.data.lessons).toHaveLength(0);
    expect(r2.data.suppressed).toBe(1);

    const r3 = await runLessons(
      { file: 'src/a.ts', session: 'auto', 'no-dedup': true },
      ['query'],
      root,
    );
    if (r3.subcommand !== 'query') throw new Error('expected query');
    expect(r3.data.lessons).toHaveLength(1);
  });

  it('threads the auto correlator (day-key shape) into recall telemetry', async () => {
    const prevTel = process.env.AGENTSMESH_LESSONS_TELEMETRY;
    process.env.AGENTSMESH_LESSONS_TELEMETRY = '1';
    try {
      seedSimpleGraph();
      await runLessons({ file: 'src/a.ts', session: 'auto' }, ['query'], root);
      const recs = readRecallLog(root);
      expect(recs).toHaveLength(1);
      expect(recs[0]!.session).toMatch(/^auto-\d{4}-\d{2}-\d{2}$/);
    } finally {
      if (prevTel === undefined) delete process.env.AGENTSMESH_LESSONS_TELEMETRY;
      else process.env.AGENTSMESH_LESSONS_TELEMETRY = prevTel;
    }
  });

  it('prefers AGENTSMESH_SESSION_ID over the day key when the env is set', async () => {
    seedSimpleGraph();
    const envId = `env-auto-${process.pid}`;
    process.env.AGENTSMESH_SESSION_ID = envId;
    const r1 = await runLessons({ file: 'src/a.ts', session: 'auto' }, ['query'], root);
    if (r1.subcommand !== 'query') throw new Error('expected query');
    expect(r1.data.lessons).toHaveLength(1);
    const r2 = await runLessons({ file: 'src/a.ts', session: 'auto' }, ['query'], root);
    if (r2.subcommand !== 'query') throw new Error('expected query');
    expect(r2.data.lessons).toHaveLength(0);
    // Clearing the ENV-derived, project-namespaced session restores delivery —
    // proof the env id (not the day key) was the correlator.
    clearSeen(envId, root);
    const r3 = await runLessons({ file: 'src/a.ts', session: 'auto' }, ['query'], root);
    if (r3.subcommand !== 'query') throw new Error('expected query');
    expect(r3.data.lessons).toHaveLength(1);
  });
});

describe('runLessons query — ranking and caps', () => {
  function seedMany(): void {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'topic-x-1': {
          rule: 'Normalize windows path separators to forward slashes.',
          topics: ['topic-x'],
          triggers: ['t-broad'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'topic-x-2': {
          rule: 'Prefer interfaces over type aliases.',
          topics: ['topic-x'],
          triggers: ['t-broad'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
        'topic-x-3': {
          rule: 'Avoid default exports in shared modules.',
          topics: ['topic-x'],
          triggers: ['t-broad'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { 'topic-x': { summary: 'X.' } },
      triggers: { 't-broad': { kind: 'file_glob', pattern: 'src/**' } },
    };
    saveLessonsGraph(root, graph);
  }

  it('caps results to --top and reports totalMatches', async () => {
    seedMany();
    const r = await runLessons({ file: 'src/a.ts', top: '2' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons.length).toBe(2);
    expect(r.data.totalMatches).toBe(3);
  });

  it('--all returns every match (no cap)', async () => {
    seedMany();
    const r = await runLessons({ file: 'src/a.ts', all: true }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons.length).toBe(3);
  });

  function seedManyLong(): void {
    const filler = 'word '.repeat(Math.ceil((DEFAULT_RECALL_MAX_TOKENS * 2) / 15)).trim(); // scales with the default budget
    const lessons: LessonsGraph['lessons'] = {};
    for (let i = 0; i < 20; i++) {
      lessons[`long-${i}`] = {
        rule: `Long rule ${i} ${filler}`,
        topics: ['topic-x'],
        triggers: ['t-broad'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      };
    }
    saveLessonsGraph(root, {
      version: 1,
      lessons,
      topics: { 'topic-x': { summary: 'X.' } },
      triggers: { 't-broad': { kind: 'file_glob', pattern: 'src/**' } },
    });
  }

  it('applies a default token budget (trims below the default limit) when none is given', async () => {
    seedManyLong();
    const r = await runLessons({ file: 'src/a.ts' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.totalMatches).toBe(20);
    expect(r.data.lessons.length).toBeLessThan(10); // the default budget, not the limit
  });

  it('--all bypasses the default token budget', async () => {
    seedManyLong();
    const r = await runLessons({ file: 'src/a.ts', all: true }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons.length).toBe(20);
  });

  it('ranks the rule whose text matches the keyword first', async () => {
    seedMany();
    const r = await runLessons({ file: 'src/a.ts', keyword: 'windows path' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons[0]?.id).toBe('topic-x-1');
  });

  it('rejects invalid --top with a usage error (exit 2)', async () => {
    seedMany();
    for (const top of ['-1', 'wat', '0']) {
      const r = await runLessons({ file: 'src/a.ts', top }, ['query'], root);
      expect(r.exitCode).toBe(2);
      expect(r.error).toMatch(/--top/);
    }
  });

  it('rejects a bare --top flag with no value (exit 2)', async () => {
    seedMany();
    const r = await runLessons({ file: 'src/a.ts', top: true }, ['query'], root);
    expect(r.exitCode).toBe(2);
  });

  it('rejects invalid --max-tokens with a usage error (exit 2)', async () => {
    seedMany();
    const r = await runLessons({ file: 'src/a.ts', 'max-tokens': '-2' }, ['query'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/--max-tokens/);
  });
});

describe('runLessons merge', () => {
  function seedTwoTopics(): void {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'a-keep': {
          rule: 'Canonical rule.',
          topics: ['topic-a'],
          triggers: ['t-a'],
          evidence: ['legacy:a'],
          status: 'active',
          createdAt: '2026-06-05',
        },
        'b-lose': {
          rule: 'Redundant rule.',
          topics: ['topic-b'],
          triggers: ['t-b'],
          evidence: ['legacy:b'],
          status: 'active',
          createdAt: '2026-06-05',
        },
      },
      topics: { 'topic-a': { summary: 'A.' }, 'topic-b': { summary: 'B.' } },
      triggers: {
        't-a': { kind: 'file_glob', pattern: 'src/a/**' },
        't-b': { kind: 'file_glob', pattern: 'src/b/**' },
      },
    };
    saveLessonsGraph(root, graph);
  }

  it('folds the loser into the keeper and supersedes it', async () => {
    seedTwoTopics();
    const r = await runLessons({}, ['merge', 'b-lose', 'a-keep'], root);
    expect(r.subcommand).toBe('merge');
    if (r.subcommand !== 'merge') return;
    expect(r.exitCode).toBe(0);
    expect(r.data).toEqual({ loserId: 'b-lose', keeperId: 'a-keep' });

    const graph = loadLessonsGraph(root);
    expect(graph.lessons['a-keep']?.triggers).toEqual(['t-a', 't-b']);
    expect(graph.lessons['a-keep']?.topics).toEqual(['topic-a', 'topic-b']);
    expect(graph.lessons['b-lose']?.status).toBe('superseded');
    expect(graph.lessons['b-lose']?.supersededBy).toBe('a-keep');
  });

  it('errors with usage when fewer than two ids are given', async () => {
    seedTwoTopics();
    const r = await runLessons({}, ['merge', 'b-lose'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/usage/i);
  });

  it('errors on an unknown lesson id', async () => {
    seedTwoTopics();
    const r = await runLessons({}, ['merge', 'ghost', 'a-keep'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/ghost/);
  });
});

describe('runLessons strip-markers', () => {
  function seedMarkered(): void {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'topic-x-rule-1': {
          rule: 'Audit output maps. See L128',
          topics: ['topic-x'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-05',
        },
        'topic-x-rule-2': {
          rule: 'Already clean.',
          topics: ['topic-x'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-05',
        },
      },
      topics: { 'topic-x': { summary: 'X.' } },
      triggers: {},
    };
    saveLessonsGraph(root, graph);
  }

  it('strips legacy markers and reports the changed ids', async () => {
    seedMarkered();
    const r = await runLessons({}, ['strip-markers'], root);
    expect(r.subcommand).toBe('strip-markers');
    if (r.subcommand !== 'strip-markers') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.changedIds).toEqual(['topic-x-rule-1']);
    expect(r.data.changedCount).toBe(1);
    expect(r.data.dryRun).toBe(false);
    expect(loadLessonsGraph(root).lessons['topic-x-rule-1']?.rule).toBe('Audit output maps.');
  });

  it('--dry-run reports without writing', async () => {
    seedMarkered();
    const r = await runLessons({ 'dry-run': true }, ['strip-markers'], root);
    if (r.subcommand !== 'strip-markers') return;
    expect(r.data.changedIds).toEqual(['topic-x-rule-1']);
    expect(r.data.dryRun).toBe(true);
    expect(loadLessonsGraph(root).lessons['topic-x-rule-1']?.rule).toBe(
      'Audit output maps. See L128',
    );
  });
});

describe('runLessons show / query edge branches', () => {
  it('show errors with usage when no topic arg is given', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['show'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/usage/i);
  });

  it('query accepts --command as an alias for --cmd', async () => {
    seedSimpleGraph();
    const graph = loadLessonsGraph(root);
    graph.triggers['t-cmd'] = { kind: 'command_pattern', pattern: '^pnpm test' };
    graph.lessons['topic-x-rule-1'].triggers = ['t-cmd'];
    saveLessonsGraph(root, graph);
    const r = await runLessons({ command: 'pnpm test' }, ['query'], root);
    if (r.subcommand !== 'query') return;
    expect(r.data.lessons.map((l) => l.id)).toEqual(['topic-x-rule-1']);
  });
});

describe('runLessons validate', () => {
  it('returns ok for a clean graph', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['validate'], root);
    if (r.subcommand !== 'validate') return;
    expect(r.data.ok).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('returns non-zero exit code when errors are found', async () => {
    seedSimpleGraph();
    const graph = loadLessonsGraph(root);
    graph.lessons['topic-x-rule-1'].topics = ['ghost'];
    saveLessonsGraph(root, graph);
    const r = await runLessons({}, ['validate'], root);
    expect(r.exitCode).toBe(1);
  });

  it('reports ok on a project with no graph (validates the empty graph)', async () => {
    const r = await runLessons({}, ['validate'], root);
    if (r.subcommand !== 'validate') return;
    expect(r.data.ok).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('surfaces a dead file_glob trigger (its files were renamed away in git) as a warning', async () => {
    // End-to-end wiring: the handler computes the real working-tree file list and
    // git evidence and passes them to validate, so a glob whose files git history
    // renamed away is flagged. Warning-level, so the graph stays ok / exit 0.
    initRepo(root);
    writeFile(root, 'src/long/gone/a.ts', 'export const movedAway = "this file is renamed";\n');
    commitAll(root, 'init');
    git(root, ['mv', 'src/long/gone', 'src/long/here']);
    commitAll(root, 'rename');
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'x-rule': {
          rule: 'R.',
          topics: ['t'],
          triggers: ['t-dead'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-05',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: { 't-dead': { kind: 'file_glob', pattern: 'src/long/gone/**/*.ts' } },
    };
    saveLessonsGraph(root, graph);
    const r = await runLessons({}, ['validate'], root);
    if (r.subcommand !== 'validate') return;
    expect(
      r.data.findings.some((f) => f.code === 'DEAD_FILE_GLOB' && f.triggerId === 't-dead'),
    ).toBe(true);
    expect(r.data.ok).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('surfaces the log-derived health view (uncovered repeat failure) as a warning, exit 0', async () => {
    seedSimpleGraph();
    appendOutcomeEvent(root, failEvent('file:docs/gap.ts'), TELEMETRY_ON);
    appendOutcomeEvent(root, failEvent('file:docs/gap.ts'), TELEMETRY_ON);
    const r = await runLessons({}, ['validate'], root);
    if (r.subcommand !== 'validate') return;
    expect(r.data.findings.some((f) => f.code === 'UNCOVERED_FAILURE')).toBe(true);
    expect(r.data.ok).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('flags an ineffective lesson (delivered, never helped) as a warning, exit 0', async () => {
    seedSimpleGraph();
    // A miss needs a later failure on an action the lesson's own trigger matches.
    const keys = ['file:src/a.ts', 'file:src/b.ts', 'file:src/c.ts'];
    for (const k of keys)
      appendOutcomeEvent(root, deliveredEvent('topic-x-rule-1', k), TELEMETRY_ON);
    for (const k of keys)
      appendOutcomeEvent(root, { ...failEvent(k), ts: '2026-01-01T00:01:00Z' }, TELEMETRY_ON);
    const r = await runLessons({}, ['validate'], root);
    if (r.subcommand !== 'validate') return;
    expect(
      r.data.findings.some(
        (f) => f.code === 'INEFFECTIVE_LESSON' && f.lessonId === 'topic-x-rule-1',
      ),
    ).toBe(true);
    expect(r.exitCode).toBe(0);
  });
});

describe('runLessons journal', () => {
  it('returns lessons sorted by createdAt then id', async () => {
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        'b-rule': {
          rule: 'B.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-02',
        },
        'a-rule': {
          rule: 'A.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: '.' } },
      triggers: {},
    };
    saveLessonsGraph(root, graph);
    const r = await runLessons({}, ['journal'], root);
    if (r.subcommand !== 'journal') return;
    expect(r.data.entries.map((e) => e.id)).toEqual(['a-rule', 'b-rule']);
  });

  it('sorts by createdAt then id from a descending, mixed-date persisted graph', async () => {
    const mk = (rule: string, createdAt: string): LessonsGraph['lessons'][string] => ({
      rule,
      topics: ['t'],
      triggers: [],
      evidence: [],
      status: 'active',
      createdAt,
    });
    // Persisted descending by id, with a later date on the first key — forces the
    // journal sort to do real work across both the createdAt and id tie-breaks.
    writeRawGraph(root, {
      version: 1,
      lessons: {
        zzz: mk('Z.', '2026-06-02'),
        mmm: mk('M.', '2026-06-01'),
        aaa: mk('A.', '2026-06-01'),
      },
      topics: { t: { summary: '.' } },
      triggers: {},
    });
    const r = await runLessons({}, ['journal'], root);
    if (r.subcommand !== 'journal') return;
    // 06-01 group first (id asc: aaa, mmm), then 06-02 (zzz).
    expect(r.data.entries.map((e) => e.id)).toEqual(['aaa', 'mmm', 'zzz']);
  });
});

describe('runLessons import-md', () => {
  it('runs the migrator, reports counts, and removes legacy files', async () => {
    cpSync(LEGACY_FIXTURE, join(root, '.agentsmesh/lessons'), { recursive: true });
    const r = await runLessons({ 'migrated-at': '2026-06-05' }, ['import-md'], root);
    if (r.subcommand !== 'import-md') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.topicCount).toBe(2);
    expect(r.data.lessonCount).toBe(5);
    expect(r.data.deletedPaths.length).toBeGreaterThan(0);
    expect(existsSync(join(root, '.agentsmesh/lessons/lessons.json'))).toBe(true);
    expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(false);
    expect(existsSync(join(root, '.agentsmesh/lessons/topics'))).toBe(false);
  });

  it('defaults the migrated-at stamp to today when --migrated-at is omitted', async () => {
    cpSync(LEGACY_FIXTURE, join(root, '.agentsmesh/lessons'), { recursive: true });
    const r = await runLessons({}, ['import-md'], root);
    if (r.subcommand !== 'import-md') return;
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, '.agentsmesh/lessons/lessons.json'))).toBe(true);
  });

  it('refuses to overwrite an existing lessons.json without --force', async () => {
    cpSync(LEGACY_FIXTURE, join(root, '.agentsmesh/lessons'), { recursive: true });
    seedSimpleGraph();
    const r = await runLessons({}, ['import-md'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/already exists/i);
  });

  it('--force overwrites an existing lessons.json', async () => {
    cpSync(LEGACY_FIXTURE, join(root, '.agentsmesh/lessons'), { recursive: true });
    seedSimpleGraph();
    const r = await runLessons({ force: true, 'migrated-at': '2026-06-05' }, ['import-md'], root);
    expect(r.exitCode).toBe(0);
    const reloaded = readFileSync(join(root, '.agentsmesh/lessons/lessons.json'), 'utf8');
    expect(reloaded).not.toContain('topic-x'); // seed-graph topic is gone — replaced by migrated graph
  });

  it('reports a clean error (no raw ENOENT) when no legacy store exists', async () => {
    const r = await runLessons({}, ['import-md'], root);
    expect(r.subcommand).toBe('import-md');
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/nothing to migrate/i);
    expect(r.error).not.toMatch(/ENOENT/);
  });

  it('--force does not crash when the legacy store is absent', async () => {
    const r = await runLessons({ force: true }, ['import-md'], root);
    expect(r.subcommand).toBe('import-md');
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/nothing to migrate/i);
    expect(r.error).not.toMatch(/ENOENT/);
  });
});

describe('runLessons stats', () => {
  it('dispatches to the stats handler and reports whether a telemetry log exists', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['stats'], root);
    expect(r.subcommand).toBe('stats');
    if (r.subcommand !== 'stats') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.hasLog).toBe(false);
  });

  it('selects json format with --json', async () => {
    seedSimpleGraph();
    const r = await runLessons({ json: true }, ['stats'], root);
    if (r.subcommand !== 'stats') return;
    expect(r.format).toBe('json');
  });
});

describe('runLessons prune', () => {
  function seedOverCap(): void {
    const triggers: LessonsGraph['triggers'] = {};
    const triggerIds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const id = `t-${i}`;
      triggers[id] = { kind: 'file_glob', pattern: `src/p${i}/**` };
      triggerIds.push(id);
    }
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        big: {
          rule: 'Over-cap lesson.',
          topics: ['t'],
          triggers: triggerIds,
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers,
    };
    saveLessonsGraph(root, graph);
  }

  it('dry-runs by default and honors a custom --cap', async () => {
    seedOverCap();
    const r = await runLessons({ cap: '3' }, ['prune'], root);
    expect(r.subcommand).toBe('prune');
    if (r.subcommand !== 'prune') return;
    expect(r.exitCode).toBe(0);
    expect(r.data.applied).toBe(false);
    expect(r.data.cap).toBe(3);
    expect(r.data.trimmedLessons[0]?.keptCount).toBe(3);
    // Dry run wrote nothing — the lesson still has all 12 triggers.
    expect(loadLessonsGraph(root).lessons.big?.triggers.length).toBe(12);
  });

  it('--apply trims over-cap lessons and persists the result', async () => {
    seedOverCap();
    const r = await runLessons({ apply: true, cap: '3' }, ['prune'], root);
    if (r.subcommand !== 'prune') return;
    expect(r.data.applied).toBe(true);
    expect(loadLessonsGraph(root).lessons.big?.triggers.length).toBe(3);
  });

  it.each(['0', '-1', '1.5', 'abc', '0x10', '3 apples'])(
    'rejects --cap %j with a usage error (exit 2) and writes nothing, even with --apply',
    async (cap) => {
      seedOverCap();
      const before = readFileSync(graphFilePath(root), 'utf8');
      const r = await runLessons({ apply: true, cap }, ['prune'], root);
      expect(r.exitCode).toBe(2);
      expect(r.error).toBe('Invalid --cap: expected a positive integer.');
      expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
    },
  );

  it('reports an empty plan on a project with no graph (dry-run and apply)', async () => {
    const dry = await runLessons({}, ['prune'], root);
    if (dry.subcommand !== 'prune') return;
    expect(dry.data.trimmedLessons).toEqual([]);
    expect(dry.data.removedTriggerIds).toEqual([]);

    const applied = await runLessons({ apply: true }, ['prune'], root);
    if (applied.subcommand !== 'prune') return;
    expect(applied.data.applied).toBe(true);
    expect(applied.data.trimmedLessons).toEqual([]);
  });
});

describe('runLessons — cross-cutting hardening', () => {
  it('validate diagnoses an unparseable graph as a structured CORRUPT_GRAPH finding', async () => {
    const path = graphFilePath(root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{ not json', 'utf8');
    const r = await runLessons({}, ['validate'], root);
    if (r.subcommand !== 'validate') throw new Error('expected validate');
    expect(r.exitCode).toBe(1);
    expect(r.data.ok).toBe(false);
    expect(r.data.findings.some((f) => f.code === 'CORRUPT_GRAPH' && f.level === 'error')).toBe(
      true,
    );
    // Routes the user at the recovery path, not a raw parse stack.
    expect(r.data.findings[0]!.message).toMatch(/git/);
  });

  it('a corrupt LEGACY store degrades recall to empty but still fails a write loudly', async () => {
    // Legacy index.yaml present (malformed), no graph: migration throws inside.
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(join(root, '.agentsmesh/lessons/index.yaml'), ':: not yaml ::\n- [', 'utf8');

    // Recall path: must not crash; degrades to an absent graph → empty result.
    const q = await runLessons({ file: 'src/x.ts' }, ['query'], root);
    if (q.subcommand !== 'query') throw new Error('expected query');
    expect(q.exitCode).toBe(0);
    expect(q.data.lessons).toEqual([]);

    // Write path: keeps the loud failure so a fresh empty graph can never
    // strand the unmigrated legacy store.
    await expect(
      runLessons(
        { topic: 't', 'new-topic': true, 'topic-summary': 'T.', 'trigger-file': 'src/**' },
        ['add', 'Rule.'],
        root,
      ),
    ).rejects.toThrow();
  });

  it('deprecate of an unknown id points at the listing commands', async () => {
    seedSimpleGraph();
    const r = await runLessons({}, ['deprecate', 'no-such-id'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/Unknown lesson/);
    expect(r.error).toMatch(/lessons journal/);
  });

  it('a rejected add surfaces a clean message without the internal function prefix', async () => {
    seedSimpleGraph();
    const glob = `src/${'{a,b}'.repeat(20)}`;
    const r = await runLessons(
      // Too many brace expansions: refused before any write.
      { topic: 'topic-x', 'trigger-file': glob },
      ['add', 'Unsafe glob rule.'],
      root,
    );
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(
      new RegExp(
        `^--trigger-file ${JSON.stringify(glob).replace(/[{}]/g, '\\$&')} is outside the safe glob subset: `,
      ),
    );
  });
});
