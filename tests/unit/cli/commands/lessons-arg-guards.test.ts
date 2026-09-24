import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsFlags } from '../../../../src/cli/commands/lessons-helpers.js';
import {
  lessonsPositionalLimit,
  repeatableLessonsFlags,
} from '../../../../src/cli/commands/lessons-known-flags.js';
import { LESSONS_SUBCOMMANDS } from '../../../../src/cli/commands/lessons-usage.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../../src/lessons/graph-store.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-arg-guards-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Seed one active lesson and return the graph bytes. */
function seed(): string {
  saveLessonsGraph(root, {
    version: 2,
    lessons: {
      't-seed': {
        rule: 'Seed.',
        topics: ['t'],
        triggers: ['g'],
        evidence: [],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
  });
  return readFileSync(graphFilePath(root), 'utf8');
}

describe('lessons — extra positional arguments', () => {
  it('derives each subcommand positional limit from its usage signature', () => {
    const limits = Object.fromEntries(
      LESSONS_SUBCOMMANDS.map((s) => [s, lessonsPositionalLimit(s)]),
    );
    expect(limits).toEqual({
      query: 0,
      add: 1,
      topics: 0,
      show: 1,
      deprecate: 1,
      merge: 2,
      untrigger: 2,
      'strip-markers': 0,
      journal: 0,
      validate: 0,
      resolve: 0,
      stats: 0,
      prune: 0,
      'import-md': 0,
    });
    expect(lessonsPositionalLimit('hook')).toBeUndefined();
    expect(lessonsPositionalLimit('merge-driver')).toBeUndefined();
  });

  it('rejects an unquoted multi-word rule instead of storing its first word', async () => {
    const r = await runLessons(
      { topic: 'db', 'new-topic': true, 'topic-summary': 'DB.', 'trigger-cmd': '\\bgit push\\b' },
      ['add', 'Never', 'force', 'push', 'to', 'main'],
      root,
    );
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('Unexpected extra argument(s): force push to main');
    expect(r.error).toContain('quote');
    expect(r.error).toContain('Usage: agentsmesh lessons add');
    expect(existsSync(graphFilePath(root))).toBe(false);
  });

  const extras: Array<[string, LessonsFlags, string[], string]> = [
    ['query', { file: 'src/a.ts' }, ['query', 'src/b.ts'], 'src/b.ts'],
    ['topics', {}, ['topics', 'x'], 'x'],
    ['show', {}, ['show', 't', 'extra'], 'extra'],
    ['deprecate', {}, ['deprecate', 't-seed', 'extra'], 'extra'],
    ['merge', {}, ['merge', 't-seed', 'b', 'c'], 'c'],
    ['untrigger', {}, ['untrigger', 't-seed', 'g', 'x', 'y'], 'x y'],
    ['prune', { apply: true }, ['prune', 'now'], 'now'],
  ];

  it.each(extras)(
    '%s: exit 2 naming the extras, graph untouched',
    async (sub, flags, args, named) => {
      const before = seed();
      const r = await runLessons(flags, args, root);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain(`Unexpected extra argument(s): ${named}`);
      expect(r.error).toContain(`Usage: agentsmesh lessons ${sub}`);
      expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
    },
  );

  it('still accepts the allowed positional count', async () => {
    seed();
    const r = await runLessons({}, ['deprecate', 't-seed'], root);
    expect(r.exitCode).toBe(0);
    expect(loadLessonsGraph(root).lessons['t-seed']?.status).toBe('deprecated');
  });
});

describe('lessons — a single-value flag given more than once', () => {
  it('treats exactly the flags marked `...` in the usage as repeatable', () => {
    const repeatable = Object.fromEntries(
      LESSONS_SUBCOMMANDS.map((s) => [s, [...repeatableLessonsFlags(s)]]),
    );
    expect(repeatable).toEqual({
      query: [],
      add: ['trigger-file', 'trigger-cmd', 'trigger-kw', 'evidence'],
      topics: [],
      show: [],
      deprecate: [],
      merge: [],
      untrigger: [],
      'strip-markers': [],
      journal: [],
      validate: [],
      resolve: [],
      stats: [],
      prune: [],
      'import-md': [],
    });
  });

  it('rejects a repeated --file instead of a false "needs a predicate"', async () => {
    seed();
    const r = await runLessons({ file: ['src/db/migrate.ts', 'README.md'] }, ['query'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('--file was given 2 times; pass it once');
    expect(r.error).toContain('Usage: agentsmesh lessons query');
  });

  it('rejects a repeated --file even next to --cmd (no falsely empty recall)', async () => {
    seed();
    const r = await runLessons({ file: ['src/a.ts', 'src/b.ts'], cmd: 'ls' }, ['query'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('--file was given 2 times; pass it once');
  });

  it('rejects a repeated --topic on add and writes nothing', async () => {
    const before = seed();
    const r = await runLessons(
      { topic: ['t', 'misc'], 'trigger-file': 'src/**' },
      ['add', 'A new rule.'],
      root,
    );
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('--topic was given 2 times; pass it once');
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
  });

  it('rejects a repeated --superseded-by on deprecate', async () => {
    const before = seed();
    const r = await runLessons({ 'superseded-by': ['a', 'b'] }, ['deprecate', 't-seed'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('--superseded-by was given 2 times; pass it once');
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
  });

  it('keeps the repeatable add flags repeatable', async () => {
    seed();
    const r = await runLessons(
      {
        topic: 't',
        'trigger-file': ['src/a.ts', 'src/b.ts'],
        'trigger-cmd': ['\\bgit push\\b', '\\bgit commit\\b'],
        evidence: ['commit:aaa', 'commit:bbb'],
      },
      ['add', 'Repeat-flag rule.'],
      root,
    );
    expect(r.exitCode).toBe(0);
    if (r.subcommand !== 'add') throw new Error('expected add');
    const stored = loadLessonsGraph(root).lessons[r.data.id]!;
    expect(stored.triggers).toHaveLength(4);
    expect(stored.evidence).toEqual(['commit:aaa', 'commit:bbb']);
  });
});
