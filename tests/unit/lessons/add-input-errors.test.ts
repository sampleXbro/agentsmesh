/**
 * Bad `add` input is a capture rejection (the caller must change it) with a
 * message in user terms: a topic id that is not kebab-case, a new topic with no
 * (or a blank) summary, and a rule measured in characters, not UTF-16 units.
 * Repeated evidence refs are stored once.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addLesson,
  InvalidTopicIdError,
  RuleTooLongError,
  TopicSummaryRequiredError,
} from '../../../src/lessons/add.js';
import { isCaptureRejection } from '../../../src/lessons/capture-rejection.js';
import { MAX_RULE_LENGTH } from '../../../src/lessons/graph-schema.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../src/lessons/graph-store.js';

let root: string;
const input = {
  rule: 'Normalize CLI display paths to forward slashes.',
  topic: 'paths',
  triggers: { files: ['src/cli/**/*.ts'] },
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-add-input-'));
  saveLessonsGraph(root, {
    version: 2,
    lessons: {},
    topics: { paths: { summary: 'Paths.' } },
    triggers: {},
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const graphText = (): string => readFileSync(graphFilePath(root), 'utf8');

describe('addLesson — topic id', () => {
  it('rejects a topic id that is not kebab-case, before any write', async () => {
    const before = graphText();
    const err: unknown = await addLesson(
      root,
      { ...input, topic: 'Build' },
      { allowNewTopic: true, topicSummary: 'Build.' },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidTopicIdError);
    expect(isCaptureRejection(err)).toBe(true);
    expect((err as InvalidTopicIdError).code).toBe('INVALID_TOPIC_ID');
    expect((err as Error).message).toBe(
      'Topic id "Build" must be kebab-case (lowercase letters, digits and -), e.g. "build".',
    );
    expect(graphText()).toBe(before);
  });

  it('suggests a kebab-case id for a spaced or underscored name', async () => {
    const err = await addLesson(
      root,
      { ...input, topic: 'CI_Build Steps' },
      { allowNewTopic: true, topicSummary: 'CI.' },
    ).catch((e: unknown) => e);
    expect((err as Error).message).toContain('e.g. "ci-build-steps"');
  });

  it('gives no suggestion when the name has no letters or digits to keep', async () => {
    const err = await addLesson(
      root,
      { ...input, topic: '日本' },
      { allowNewTopic: true, topicSummary: 'J.' },
    ).catch((e: unknown) => e);
    expect((err as Error).message).toBe(
      'Topic id "日本" must be kebab-case (lowercase letters, digits and -).',
    );
  });
});

describe('addLesson — new topic summary', () => {
  it.each([undefined, '', '   '])('rejects a new topic with summary %j', async (topicSummary) => {
    const before = graphText();
    const err: unknown = await addLesson(
      root,
      { ...input, topic: 'deploy' },
      { allowNewTopic: true, ...(topicSummary === undefined ? {} : { topicSummary }) },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TopicSummaryRequiredError);
    expect(isCaptureRejection(err)).toBe(true);
    expect((err as TopicSummaryRequiredError).code).toBe('TOPIC_SUMMARY_REQUIRED');
    expect((err as Error).message).toBe(
      'New topic "deploy" needs a one-line summary (--topic-summary on the CLI, ' +
        'topic_summary over MCP).',
    );
    expect(graphText()).toBe(before);
  });

  it('stores a trimmed summary', async () => {
    await addLesson(
      root,
      { ...input, topic: 'deploy' },
      { allowNewTopic: true, topicSummary: '  Deploy steps.  ' },
    );
    expect(loadLessonsGraph(root).topics.deploy).toEqual({ summary: 'Deploy steps.' });
  });
});

describe('addLesson — evidence and rule length', () => {
  it('stores each evidence ref once, in first-seen order', async () => {
    const { id } = await addLesson(root, {
      ...input,
      evidence: ['commit:abc', 'commit:def', 'commit:abc'],
    });
    expect(loadLessonsGraph(root).lessons[id]?.evidence).toEqual(['commit:abc', 'commit:def']);
  });

  it('counts characters, not UTF-16 units: 1500 emoji fit under the limit', async () => {
    const rule = '😀'.repeat(1500);
    const { id } = await addLesson(root, { ...input, rule });
    expect(loadLessonsGraph(root).lessons[id]?.rule).toBe(rule);
  });

  it('reports an over-long emoji rule in characters', async () => {
    const err: unknown = await addLesson(root, {
      ...input,
      rule: '😀'.repeat(MAX_RULE_LENGTH + 1),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RuleTooLongError);
    expect((err as Error).message).toMatch(/^Lesson rule is 2001 characters \(max 2000\)\./);
  });

  it('writes no graph file when the first capture is rejected', async () => {
    rmSync(graphFilePath(root));
    await addLesson(
      root,
      { ...input, topic: 'Nope' },
      { allowNewTopic: true, topicSummary: 'N.' },
    ).catch(() => undefined);
    expect(existsSync(graphFilePath(root))).toBe(false);
  });
});
