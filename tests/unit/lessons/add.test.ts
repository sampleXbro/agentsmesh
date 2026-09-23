import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addLesson,
  BroadCommandPatternError,
  EmptyRuleError,
  RuleTooLongError,
  UnknownTopicError,
  UnrecallableLessonError,
} from '../../../src/lessons/add.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { MAX_RULE_LENGTH, type LessonsGraph } from '../../../src/lessons/graph-schema.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-add-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function seedGraph(graph: LessonsGraph): void {
  saveLessonsGraph(root, graph);
}

const baseTopics = { 'windows-paths': { summary: 'Path handling.' } } as const;

const baseInput = {
  rule: 'Always normalize CLI display paths to forward slashes.',
  topic: 'windows-paths',
  triggers: { files: ['src/cli/**/*.ts'] },
  evidence: ['commit:abc'],
  createdAt: '2026-06-05',
};

describe('addLesson', () => {
  it('writes a new lessons.json when the file does not exist', async () => {
    const result = await addLesson(root, baseInput, {
      allowNewTopic: true,
      topicSummary: 'Path handling.',
    });
    expect(result.isNewLesson).toBe(true);
    expect(result.isNewTopic).toBe(true);
    expect(result.newTriggerIds.length).toBe(1);

    const graph = loadLessonsGraph(root);
    expect(graph.lessons[result.id]?.rule).toBe(baseInput.rule);
    expect(graph.lessons[result.id]?.triggers).toEqual(result.newTriggerIds);
    expect(graph.topics['windows-paths']?.summary).toBe('Path handling.');
  });

  it('captures an always-scoped lesson with NO trigger (gates skipped, scope stored)', async () => {
    const result = await addLesson(
      root,
      { rule: 'Write comments per the repo style.', topic: 'style', triggers: {}, scope: 'always' },
      { allowNewTopic: true, topicSummary: 'Style.' },
    );
    expect(result.isNewLesson).toBe(true);
    const graph = loadLessonsGraph(root);
    const lesson = graph.lessons[result.id];
    expect(lesson?.scope).toBe('always');
    expect(lesson?.triggers).toEqual([]);
  });

  it('assigns a deterministic kebab-case id derived from topic and rule', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const result = await addLesson(root, baseInput);
    expect(result.id).toMatch(/^[a-z0-9-]+$/);
    expect(result.id.startsWith('windows-paths-')).toBe(true);
  });

  it('rejects a new lesson with no triggers (unreachable)', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    await expect(addLesson(root, { ...baseInput, triggers: {} })).rejects.toThrow(
      /at least one trigger/i,
    );
  });

  it('allows re-adding an existing lesson with no new triggers (upsert keeps its triggers)', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const first = await addLesson(root, baseInput); // has a trigger-file
    const again = await addLesson(root, {
      ...baseInput,
      triggers: {},
      evidence: ['commit:def'],
    });
    expect(again.id).toBe(first.id);
    expect(again.isNewLesson).toBe(false);
    expect(loadLessonsGraph(root).lessons[again.id]?.evidence).toContain('commit:def');
  });

  it('rejects an unknown topic without allowNewTopic', async () => {
    await expect(addLesson(root, { ...baseInput, topic: 'nope' }, {})).rejects.toBeInstanceOf(
      UnknownTopicError,
    );
  });

  it('requires a topic summary when allowNewTopic adds a topic', async () => {
    await expect(addLesson(root, baseInput, { allowNewTopic: true })).rejects.toThrow(
      /needs a one-line summary/,
    );
  });

  it('reuses an existing trigger node when the (kind, pattern) already exists', async () => {
    seedGraph({
      version: 1,
      lessons: {},
      topics: baseTopics,
      triggers: { 't-existing': { kind: 'file_glob', pattern: 'src/cli/**/*.ts' } },
    });
    const result = await addLesson(root, baseInput);
    expect(result.newTriggerIds).toEqual([]);
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[result.id]?.triggers).toEqual(['t-existing']);
    expect(Object.keys(graph.triggers)).toEqual(['t-existing']);
  });

  it('creates new trigger nodes when patterns differ', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const result = await addLesson(root, {
      ...baseInput,
      triggers: {
        files: ['src/cli/**/*.ts'],
        commands: ['^pnpm test'],
        keywords: ['display path'],
      },
    });
    expect(result.newTriggerIds.length).toBe(3);
    const graph = loadLessonsGraph(root);
    const kinds = result.newTriggerIds.map((id) => graph.triggers[id]?.kind);
    expect(kinds.sort()).toEqual(['command_pattern', 'file_glob', 'keyword']);
  });

  it('normalizes backslashes in file_glob trigger patterns to forward slashes', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const result = await addLesson(root, {
      ...baseInput,
      triggers: { files: ['src\\cli\\**\\*.ts'] },
    });
    const graph = loadLessonsGraph(root);
    const patterns = result.newTriggerIds.map((id) => graph.triggers[id]?.pattern);
    expect(patterns).toEqual(['src/cli/**/*.ts']);
  });

  it('dedupes a backslash file_glob against the forward-slash node it normalizes to', async () => {
    seedGraph({
      version: 1,
      lessons: {},
      topics: baseTopics,
      triggers: { 't-existing': { kind: 'file_glob', pattern: 'src/cli/**/*.ts' } },
    });
    const result = await addLesson(root, {
      ...baseInput,
      triggers: { files: ['src\\cli\\**\\*.ts'] },
    });
    expect(result.newTriggerIds).toEqual([]);
    const graph = loadLessonsGraph(root);
    expect(Object.keys(graph.triggers)).toEqual(['t-existing']);
  });

  it('is idempotent: re-adding the same rule + topic returns the same id and does not duplicate triggers', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const first = await addLesson(root, baseInput);
    const second = await addLesson(root, baseInput);
    expect(second.id).toBe(first.id);
    expect(second.isNewLesson).toBe(false);
    const graph = loadLessonsGraph(root);
    expect(Object.keys(graph.lessons)).toEqual([first.id]);
    expect(Object.keys(graph.triggers).length).toBe(1);
  });

  it('treats whitespace and case variations as the same rule for idempotency', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const first = await addLesson(root, baseInput);
    const second = await addLesson(root, {
      ...baseInput,
      rule: '  ALWAYS  normalize  CLI display paths to forward slashes.  ',
    });
    expect(second.id).toBe(first.id);
    expect(second.isNewLesson).toBe(false);
  });

  it('appends a distinct lesson when topic matches but rule text differs', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const a = await addLesson(root, baseInput);
    const b = await addLesson(root, {
      ...baseInput,
      rule: 'Strip trailing slashes from emitted paths.',
    });
    expect(b.id).not.toBe(a.id);
    expect(b.isNewLesson).toBe(true);
    const graph = loadLessonsGraph(root);
    expect(Object.keys(graph.lessons).sort()).toEqual([a.id, b.id].sort());
  });

  it('serializes concurrent adders without losing data', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      ...baseInput,
      rule: `Concurrent rule ${i}.`,
      triggers: { files: [`src/c${i}/**/*.ts`] },
    }));
    const results = await Promise.all(
      inputs.map((input) => addLesson(root, input, { retries: 50 })),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(5);
    const graph = loadLessonsGraph(root);
    expect(Object.keys(graph.lessons).length).toBe(5);
    expect(Object.keys(graph.triggers).length).toBe(5);
  });

  it('suffixes the id when two distinct rules slug to the same base in a topic', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const a = await addLesson(root, {
      ...baseInput,
      rule: 'alpha beta gamma delta epsilon one',
    });
    const b = await addLesson(root, {
      ...baseInput,
      rule: 'alpha beta gamma delta epsilon two',
    });
    expect(b.id).not.toBe(a.id);
    expect(b.id.endsWith('-2')).toBe(true);
  });

  it('falls back to a hash id when the rule has no alphanumeric words', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const r = await addLesson(root, { ...baseInput, rule: '!!! ??? ...' });
    expect(r.id).toMatch(/^windows-paths-[0-9a-f]{8}$/);
  });

  it('defaults createdAt to today (UTC ISO date) when omitted', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const { createdAt: _omit, ...noDate } = baseInput;
    const r = await addLesson(root, noDate);
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.id]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults evidence to an empty array when omitted', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const { evidence: _drop, ...noEvidence } = baseInput;
    const r = await addLesson(root, noEvidence);
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.id]?.evidence).toEqual([]);
  });

  it('deduplicates a trigger pattern repeated within a single add call', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const r = await addLesson(root, {
      ...baseInput,
      triggers: { files: ['src/dup/**', 'src/dup/**'] },
    });
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.id]?.triggers.length).toBe(1);
    expect(Object.keys(graph.triggers).length).toBe(1);
  });

  it('upserts new triggers and evidence onto an existing rule instead of dropping them', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const first = await addLesson(root, baseInput);
    const second = await addLesson(root, {
      ...baseInput,
      triggers: { files: ['src/new/**'] },
      evidence: ['commit:def'],
    });
    expect(second.id).toBe(first.id);
    expect(second.isNewLesson).toBe(false);
    expect(second.newTriggerIds.length).toBe(1);
    const graph = loadLessonsGraph(root);
    const lesson = graph.lessons[first.id];
    expect(lesson?.triggers.length).toBe(2);
    expect(lesson?.evidence).toContain('commit:abc');
    expect(lesson?.evidence).toContain('commit:def');
  });

  it('adds a new topic to an existing rule when re-captured under it (global dedup, no duplicate)', async () => {
    seedGraph({
      version: 1,
      lessons: {},
      topics: { 'windows-paths': { summary: 'P.' }, 'shell-quoting': { summary: 'S.' } },
      triggers: {},
    });
    const first = await addLesson(root, baseInput);
    const second = await addLesson(root, { ...baseInput, topic: 'shell-quoting' });
    expect(second.id).toBe(first.id);
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[first.id]?.topics.slice().sort()).toEqual([
      'shell-quoting',
      'windows-paths',
    ]);
    expect(Object.keys(graph.lessons)).toEqual([first.id]);
  });

  it('re-capturing a rule that matches only a DEPRECATED lesson creates a fresh active lesson', async () => {
    seedGraph({
      version: 1,
      lessons: {
        'windows-paths-dead': {
          rule: baseInput.rule,
          topics: ['windows-paths'],
          triggers: [],
          evidence: [],
          status: 'deprecated',
          createdAt: '2026-06-01',
        },
      },
      topics: baseTopics,
      triggers: {},
    });
    const r = await addLesson(root, baseInput);
    expect(r.isNewLesson).toBe(true);
    expect(r.id).not.toBe('windows-paths-dead');
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[r.id]?.status).toBe('active');
    // the dead lesson is untouched (not enriched, still deprecated)
    expect(graph.lessons['windows-paths-dead']?.status).toBe('deprecated');
    expect(graph.lessons['windows-paths-dead']?.triggers).toEqual([]);
  });

  it('rejects an invalid command_pattern regex at capture (transactional validation)', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    await expect(addLesson(root, { ...baseInput, triggers: { commands: ['('] } })).rejects.toThrow(
      /INVALID_TRIGGER_PATTERN|invalid/i,
    );
    // nothing was persisted
    expect(Object.keys(loadLessonsGraph(root).lessons)).toEqual([]);
  });

  it('fills in a missing rationale on re-capture (upsert)', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const first = await addLesson(root, baseInput); // no rationale
    await addLesson(root, { ...baseInput, rationale: 'incident 2026-06-06' });
    expect(loadLessonsGraph(root).lessons[first.id]?.rationale).toBe('incident 2026-06-06');
  });

  it('records optional rationale on the lesson', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const result = await addLesson(root, { ...baseInput, rationale: 'incident 2026-05-30' });
    const graph = loadLessonsGraph(root);
    expect(graph.lessons[result.id]?.rationale).toBe('incident 2026-05-30');
  });

  it('surfaces a broad-glob guardrail warning on capture without blocking it', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    // baseInput's trigger is a broad glob (globstar + wildcard extension).
    const r = await addLesson(root, baseInput);
    expect(r.isNewLesson).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('BROAD_GLOB_TRIGGER');
    // The capture still persisted — guardrails are non-blocking.
    expect(loadLessonsGraph(root).lessons[r.id]).toBeDefined();
  });

  it('returns no guardrail warnings for a lean, specific capture', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const r = await addLesson(root, { ...baseInput, triggers: { files: ['src/cli/paths.ts'] } });
    expect(r.warnings).toEqual([]);
  });

  it('blocks a new lesson whose only trigger is a stopword-only keyword (unrecallable)', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    await expect(
      addLesson(root, { ...baseInput, triggers: { keywords: ['state of the art'] } }),
    ).rejects.toBeInstanceOf(UnrecallableLessonError);
    // The transactional write aborted — nothing persisted.
    expect(Object.keys(loadLessonsGraph(root).lessons)).toEqual([]);
  });

  it('names the dead trigger and the --file/--cmd path in the block message', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    await expect(
      addLesson(root, { ...baseInput, triggers: { keywords: ['state of the art'] } }),
    ).rejects.toThrow(/no effective trigger[\s\S]*--file\/--cmd/);
  });

  it('allows a capture that mixes a dead keyword with a live file_glob (one effective is enough)', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const r = await addLesson(root, {
      ...baseInput,
      triggers: { files: ['src/auth.ts'], keywords: ['state of the art'] },
    });
    expect(r.isNewLesson).toBe(true);
    // The dead keyword still surfaces as a non-blocking warning.
    expect(r.warnings.map((w) => w.code)).toContain('STOPWORD_KEYWORD');
  });

  it('allows an upsert that adds a dead trigger to an already-effective lesson', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const first = await addLesson(root, baseInput); // live file_glob
    const again = await addLesson(root, {
      ...baseInput,
      triggers: { keywords: ['state of the art'] },
    });
    expect(again.id).toBe(first.id);
    expect(again.isNewLesson).toBe(false);
  });

  it('surfaces a NEAR_DUPLICATE_LESSON warning when a new lesson paraphrases an active one', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    await addLesson(root, {
      ...baseInput,
      rule: 'Run the test suite before committing changes.',
      triggers: { files: ['src/a.ts'] },
    });
    const para = await addLesson(root, {
      ...baseInput,
      rule: 'Before committing changes run the test suite.',
      triggers: { files: ['src/b.ts'] },
    });
    expect(para.isNewLesson).toBe(true);
    expect(para.warnings.map((w) => w.code)).toContain('NEAR_DUPLICATE_LESSON');
  });

  it('does NOT emit NEAR_DUPLICATE_LESSON on an exact re-capture (it upserts instead)', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    await addLesson(root, baseInput);
    const again = await addLesson(root, baseInput);
    expect(again.isNewLesson).toBe(false);
    expect(again.warnings.map((w) => w.code)).not.toContain('NEAR_DUPLICATE_LESSON');
  });

  it('rejects a rule longer than MAX_RULE_LENGTH with RuleTooLongError', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const tooLong = 'a'.repeat(MAX_RULE_LENGTH + 1);
    await expect(addLesson(root, { ...baseInput, rule: tooLong })).rejects.toBeInstanceOf(
      RuleTooLongError,
    );
  });

  it('accepts a rule exactly at MAX_RULE_LENGTH', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const atCap = 'a'.repeat(MAX_RULE_LENGTH);
    const result = await addLesson(root, { ...baseInput, rule: atCap });
    expect(result.isNewLesson).toBe(true);
    expect(loadLessonsGraph(root).lessons[result.id]?.rule.length).toBe(MAX_RULE_LENGTH);
  });
});

describe('addLesson — capture rejections (rule shape, broad command pattern)', () => {
  it('rejects a whitespace-only rule with EmptyRuleError and leaves the graph untouched', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    await expect(addLesson(root, { ...baseInput, rule: '   ' })).rejects.toBeInstanceOf(
      EmptyRuleError,
    );
    expect(loadLessonsGraph(root).lessons).toEqual({});
  });

  it.each(['.*', ' '])(
    'rejects the over-broad command pattern %j with BroadCommandPatternError',
    async (pattern) => {
      seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
      await expect(
        addLesson(root, { ...baseInput, triggers: { commands: [pattern] } }),
      ).rejects.toBeInstanceOf(BroadCommandPatternError);
      expect(loadLessonsGraph(root).triggers).toEqual({});
    },
  );

  it('accepts a word-bounded command class', async () => {
    seedGraph({ version: 1, lessons: {}, topics: baseTopics, triggers: {} });
    const result = await addLesson(root, {
      ...baseInput,
      triggers: { commands: ['\\brm\\b'] },
    });
    expect(result.isNewLesson).toBe(true);
  });
});
