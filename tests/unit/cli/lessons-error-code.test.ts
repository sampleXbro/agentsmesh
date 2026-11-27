import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLessons } from '../../../src/cli/commands/lessons.js';
import { handleResult } from '../../../src/cli/json-handler.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';

/**
 * A failed `lessons` command carries the stable error `code` of the thrown
 * capture error, so `--json` consumers do not have to match message text.
 * Plain text and exit codes stay as they were.
 */

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
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const RULE = 'Keep the build green here.';

describe('lessons add failures carry the error code', () => {
  it.each([
    ['UNKNOWN_TOPIC', 1, { topic: 'nope', 'trigger-file': 'src/**' }, RULE],
    ['EMPTY_RULE', 2, { topic: 't', 'trigger-file': 'src/**' }, '   '],
    ['BROAD_COMMAND_PATTERN', 2, { topic: 't', 'trigger-cmd': '.*' }, RULE],
    ['INVALID_TOPIC_ID', 2, { topic: 'Build', 'new-topic': true, 'topic-summary': 'B.' }, RULE],
    ['TOPIC_SUMMARY_REQUIRED', 2, { topic: 'deploy', 'new-topic': true }, RULE],
    ['UNSAFE_GLOB_PATTERN', 2, { topic: 't', 'trigger-file': 'src/+(a|b).ts' }, RULE],
    ['NO_TRIGGER', 2, { topic: 't' }, RULE],
    ['UNRECALLABLE_LESSON', 2, { topic: 't', 'trigger-kw': 'of the' }, RULE],
  ])('%s keeps exit code %i', async (code, exitCode, flags, rule) => {
    const r = await runLessons(flags, ['add', rule], root);
    expect(r.exitCode).toBe(exitCode);
    expect(r.error).toBeTruthy();
    expect(r).toMatchObject({ code });
  });

  it('keeps the plain error text of an unknown topic unchanged', async () => {
    const r = await runLessons({ topic: 'nope', 'trigger-file': 'src/**' }, ['add', RULE], root);
    expect(r.error).toBe(
      'Unknown topic: nope. Pass --new-topic --topic-summary "..." to create it.',
    );
  });

  it('gives usage errors (missing flags) no code', async () => {
    const noTopic = await runLessons({}, ['add', RULE], root);
    expect(noTopic.exitCode).toBe(2);
    expect(noTopic).not.toHaveProperty('code');
    const badScope = await runLessons({ topic: 't', scope: 'sometimes' }, ['add', RULE], root);
    expect(badScope.exitCode).toBe(2);
    expect(badScope).not.toHaveProperty('code');
  });

  it('gives a successful add no code', async () => {
    const r = await runLessons({ topic: 't', 'trigger-file': 'src/**' }, ['add', RULE], root);
    expect(r.exitCode).toBe(0);
    expect(r).not.toHaveProperty('code');
  });
});

describe('lessons add --json envelope', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('prints success, command, error, code and data, and exits with the same code', async () => {
    const result = await runLessons(
      { topic: 'nope', 'trigger-file': 'src/**' },
      ['add', RULE],
      root,
    );
    handleResult('lessons', result, { json: true }, vi.fn());
    const envelope = JSON.parse(writeSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(Object.keys(envelope)).toEqual(['success', 'command', 'error', 'code', 'data']);
    expect(envelope).toMatchObject({
      success: false,
      command: 'lessons',
      error: 'Unknown topic: nope. Pass --new-topic --topic-summary "..." to create it.',
      code: 'UNKNOWN_TOPIC',
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
