/**
 * A lessons flag that takes a value but got none is an input error (exit 2),
 * never silently ignored: `deprecate X --superseded-by` used to deprecate
 * without the supersede link, `query --session` skipped dedup, and
 * `add … --scope` reported a missing trigger instead of the missing value.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import {
  lessonsValueFlags,
  validateLessonsFlags,
} from '../../../../src/cli/commands/lessons-known-flags.js';
import { LESSONS_SUBCOMMANDS } from '../../../../src/cli/commands/lessons-usage.js';
import { graphFilePath, saveLessonsGraph } from '../../../../src/lessons/graph-store.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-flag-values-'));
  saveLessonsGraph(root, {
    version: 2,
    lessons: {
      'build-seed': {
        rule: 'Seed.',
        topics: ['build'],
        triggers: ['g'],
        evidence: [],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
    topics: { build: { summary: 'Build.' } },
    triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('lessonsValueFlags', () => {
  it('lists exactly the flags that take a value, per subcommand', () => {
    const table = Object.fromEntries(LESSONS_SUBCOMMANDS.map((s) => [s, lessonsValueFlags(s)]));
    expect(table).toEqual({
      query: ['file', 'cmd', 'keyword', 'format', 'top', 'max-tokens', 'session', 'command'],
      add: [
        'topic',
        'trigger-file',
        'trigger-cmd',
        'trigger-kw',
        'evidence',
        'rationale',
        'topic-summary',
        'scope',
        'rule',
      ],
      topics: [],
      show: [],
      deprecate: ['superseded-by'],
      merge: [],
      untrigger: [],
      'strip-markers': [],
      journal: [],
      validate: [],
      resolve: [],
      stats: [],
      prune: ['cap'],
      'import-md': ['migrated-at'],
    });
  });
});

describe('validateLessonsFlags — a value flag with no value', () => {
  it.each([
    ['deprecate', 'superseded-by'],
    ['query', 'session'],
    ['add', 'scope'],
    ['add', 'topic-summary'],
    ['prune', 'cap'],
  ])('%s --%s', (sub, flag) => {
    const err = validateLessonsFlags(sub, { [flag]: true });
    expect(err).toBe(
      `--${flag} needs a value. To pass a value that starts with --, write --${flag}=<value>.\n` +
        `Usage: ${validateUsage(sub)}`,
    );
  });

  it('treats an empty value as missing', () => {
    expect(validateLessonsFlags('add', { 'topic-summary': '' })).toMatch(
      /^--topic-summary needs a value\./,
    );
    expect(validateLessonsFlags('add', { 'trigger-file': ['src/a.ts', ''] })).toMatch(
      /^--trigger-file needs a value\./,
    );
  });

  it('still accepts boolean flags and real values', () => {
    expect(validateLessonsFlags('query', { always: true, ids: true, session: 'auto' })).toBeNull();
    expect(validateLessonsFlags('add', { 'new-topic': true, 'topic-summary': 'S.' })).toBeNull();
  });
});

describe('validateLessonsFlags — text that starts with --', () => {
  it('suggests --rule=<text> when an add rule starts with --', () => {
    const err = validateLessonsFlags('add', { 'no-verify is forbidden': true, topic: 'build' });
    expect(err?.split('\n')[0]).toBe(
      'Unknown flag --no-verify is forbidden for `lessons add`. To pass text that starts ' +
        'with --, join it to its flag with =, e.g. --rule="--no-verify is forbidden".',
    );
  });

  it('keeps the plain unknown-flag message for a real typo', () => {
    expect(validateLessonsFlags('add', { 'trigger-flie': 'x' })?.split('\n')[0]).toBe(
      'Unknown flag --trigger-flie for `lessons add`.',
    );
  });
});

describe('runLessons — missing values never reach the handler', () => {
  it('refuses deprecate --superseded-by without a value and keeps the lesson active', async () => {
    const before = readFileSync(graphFilePath(root), 'utf8');
    const result = await runLessons({ 'superseded-by': true }, ['deprecate', 'build-seed'], root);
    expect(result.exitCode).toBe(2);
    expect(result.error).toMatch(/^--superseded-by needs a value\./);
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
  });

  it('refuses query --session without a value', async () => {
    const result = await runLessons({ file: 'src/a.ts', session: true }, ['query'], root);
    expect(result.exitCode).toBe(2);
    expect(result.error).toMatch(/^--session needs a value\./);
  });
});

describe('runLessons help', () => {
  it('`lessons help` shows the overview', async () => {
    expect(await runLessons({}, ['help'], root)).toEqual({
      subcommand: 'help',
      exitCode: 0,
      data: null,
    });
  });

  it('`lessons help add` shows the add help', async () => {
    expect(await runLessons({}, ['help', 'add'], root)).toEqual({
      subcommand: 'help',
      exitCode: 0,
      data: null,
      topic: 'add',
    });
  });

  it('`lessons help nope` is an unknown subcommand', async () => {
    expect(await runLessons({}, ['help', 'nope'], root)).toEqual({
      subcommand: 'help',
      exitCode: 2,
      error: 'Unknown lessons subcommand: nope',
      data: null,
    });
  });
});

function validateUsage(sub: string): string {
  const err = validateLessonsFlags(sub, { 'not-a-real-flag': 'x' }) ?? '';
  return err.split('\n')[1]!.replace(/^Usage: /, '');
}
