/**
 * When a failed write is explained by an unreadable graph, `runLessons` swaps
 * the error for the graph-problem message. The `code` of the original error
 * described that error, so it must go with it: `--json` would otherwise pair
 * the new message with a code that no longer fits.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../helpers/lessons-graph-fixture.js';

class CodedError extends Error {
  readonly code = 'UNKNOWN_LESSON';
}

vi.mock('../../../src/lessons/deprecate.js', () => ({
  deprecateLesson: vi.fn(async () => {
    throw new CodedError('Unknown lesson: gone.');
  }),
}));

const { runLessons } = await import('../../../src/cli/commands/lessons.js');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-graph-problem-code-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('runLessons — a failure explained by an unreadable graph', () => {
  it('replaces the error and drops the code of the original error', async () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const r = await runLessons({}, ['deprecate', 'gone'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/merge conflict/);
    expect(r).not.toHaveProperty('code');
  });
});

describe('runLessons — a failure on a readable graph', () => {
  it('keeps the code of the error', async () => {
    saveLessonsGraph(root, { version: 2, lessons: {}, topics: {}, triggers: {} });
    const r = await runLessons({}, ['deprecate', 'gone'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain('Unknown lesson: gone.');
    expect(r).toHaveProperty('code', 'UNKNOWN_LESSON');
  });
});
