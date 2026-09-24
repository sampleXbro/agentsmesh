import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../src/cli/commands/lessons.js';
import { graphFilePath, saveLessonsGraph } from '../../../src/lessons/graph-store.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-'));
  saveLessonsGraph(root, {
    version: 1,
    lessons: {},
    topics: { t: { summary: 'T.' } },
    triggers: {},
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('lessons add — capture rejections exit 2 with the add hint; the graph is untouched', () => {
  it('rejects a whitespace-only rule as a missing rule (not an internal write-barrier error)', async () => {
    const before = await readFile(graphFilePath(root), 'utf8');
    const r = await runLessons({ topic: 't', 'trigger-file': 'src/**' }, ['add', '   '], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/rule must not be empty/i);
    expect(r.error).not.toMatch(/refusing to write/i);
    expect(r.error).toContain('Example:');
    expect(await readFile(graphFilePath(root), 'utf8')).toBe(before);
  });

  it.each(['.*', ' '])('rejects the over-broad --trigger-cmd %j', async (pattern) => {
    const before = await readFile(graphFilePath(root), 'utf8');
    const r = await runLessons(
      { topic: 't', 'trigger-cmd': pattern },
      ['add', 'Never run the thing without a lock.'],
      root,
    );
    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(/nearly every command/i);
    expect(r.error).toContain('Example:');
    expect(await readFile(graphFilePath(root), 'utf8')).toBe(before);
  });
});

describe('lessons add — bad input exits 2 and names the flag', () => {
  const add = (
    flags: Record<string, string | boolean>,
    rule = 'Keep the build green here.',
  ): ReturnType<typeof runLessons> =>
    runLessons({ 'trigger-file': 'src/**', ...flags }, ['add', rule], root);

  it.each([
    [{ topic: 't', scope: 'sometimes' }, '--scope must be "always" (got "sometimes").'],
    [
      { topic: 'Build', 'new-topic': true, 'topic-summary': 'B.' },
      'Topic id "Build" must be kebab-case (lowercase letters, digits and -), e.g. "build".',
    ],
    [
      { topic: 'deploy', 'new-topic': true },
      'New topic "deploy" needs a one-line summary (--topic-summary on the CLI, topic_summary over MCP).',
    ],
    [
      { topic: 'deploy', 'new-topic': true, 'topic-summary': '   ' },
      'New topic "deploy" needs a one-line summary (--topic-summary on the CLI, topic_summary over MCP).',
    ],
    [
      { topic: 't', 'trigger-file': 'src/+(a|b).ts' },
      '--trigger-file "src/+(a|b).ts" is outside the safe glob subset: extglobs and (…)/| groups are not supported (use {a,b}). Use only *, **, ?, [...] and {a,b}.',
    ],
  ])('%j', async (flags, message) => {
    const before = await readFile(graphFilePath(root), 'utf8');
    const r = await add(flags);
    expect(r.exitCode).toBe(2);
    expect(r.error?.split('\n')[0]).toBe(message);
    expect(r.error).toContain('Example:');
    expect(await readFile(graphFilePath(root), 'utf8')).toBe(before);
  });
});

describe('lessons write refusals exit 2 with a plain message', () => {
  it('a deprecate the validator refuses says what and that nothing was written', async () => {
    saveLessonsGraph(root, {
      version: 2,
      lessons: {
        't-old': { ...LESSON, rule: 'Old.', status: 'superseded', supersededBy: 't-mid' },
        't-mid': { ...LESSON, rule: 'Mid.' },
        't-new': { ...LESSON, rule: 'New.' },
      },
      topics: { t: { summary: 'T.' } },
      triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    });
    const before = await readFile(graphFilePath(root), 'utf8');

    const r = await runLessons({ 'superseded-by': 't-new' }, ['deprecate', 't-mid'], root);

    expect(r.exitCode).toBe(2);
    expect(r.error).toMatch(
      /^Refused to save the lessons graph: this change would add INACTIVE_SUPERSEDER: .+[^.]\. Nothing was written\.$/,
    );
    expect(r.error).not.toMatch(/Pre-existing|mutateLessonsGraph|refusing/);
    expect(await readFile(graphFilePath(root), 'utf8')).toBe(before);
  });
});

const LESSON = {
  rule: '',
  topics: ['t'],
  triggers: ['g'],
  evidence: [],
  status: 'active' as const,
  createdAt: '2026-01-01',
};
