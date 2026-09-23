/**
 * The repeat-failure warning for one tool call is ONE block: a Codex patch that
 * touches many recurring files must not repeat the same covering rules once per
 * file, and the whole injection stays within the recall payload cap.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '../../../src/lessons/context-key.js';
import { MAX_RULE_LENGTH } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { readOutcomeLog, recordFailure } from '../../../src/lessons/outcome-log.js';
import { MAX_RECALL_PAYLOAD_CHARS, RECALL_BLOCK_CLOSE } from '../../../src/lessons/rule-line.js';
import { OUTCOME_LOG_ENV } from '../../../src/lessons/telemetry.js';
import { count, graphOf, useHookProject } from './hook-test-helpers.js';

const FILES = Array.from({ length: 8 }, (_, i) => `r/f${i + 1}.txt`);
const longRule = (label: string, size = 1800): string =>
  `${label} ${'x'.repeat(size - label.length - 1)}`;
const SHARED = ['Shared rule one', 'Shared rule two', 'Shared rule three'].map((l) => longRule(l));

const project = useHookProject(() =>
  graphOf(
    Object.fromEntries(
      SHARED.map((rule, i) => [
        `s${i + 1}`,
        { rule, trigger: { kind: 'file_glob', pattern: 'r/**' } },
      ]),
    ),
  ),
);

beforeEach(() => {
  vi.stubEnv(OUTCOME_LOG_ENV, '');
});

function seedRecurring(files: readonly string[]): void {
  for (const file of files) {
    const key = contextKey({ file }, project.root());
    for (let i = 0; i < 2; i += 1) recordFailure(project.root(), key, 'same error', process.env);
  }
}

const patchOf = (files: readonly string[]): Record<string, unknown> => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'apply_patch',
  tool_input: {
    command: [
      '*** Begin Patch',
      ...files.flatMap((f) => [`*** Update File: ${f}`, '+y']),
      '*** End Patch',
    ].join('\n'),
  },
});

describe('repeat-failure warning for a multi-file patch', () => {
  it('shows one warning block with each covering rule once', async () => {
    seedRecurring(FILES);
    const ctx = await project.recall({ ...patchOf(FILES), session_id: project.session('m3') });
    expect(count(ctx, 'RECURRENT FAILURE')).toBe(1);
    expect(ctx).toContain('RECURRENT FAILURE: 8 of the files in this change have failed up to 2×');
    expect(blockIds(ctx)).toEqual([['s1', 's2'], ['s3']]);
    for (const rule of SHARED) expect(count(ctx, rule)).toBe(1);
    expect(ctx.length).toBeLessThanOrEqual(MAX_RECALL_PAYLOAD_CHARS);
  });

  it('stays within the payload cap when every file has its own long covering rules', async () => {
    const own = Object.fromEntries(
      FILES.flatMap((file, i) =>
        ['a', 'b'].map((tag) => [
          `f${i + 1}${tag}`,
          {
            rule: longRule(`Own rule ${i + 1}${tag}`, MAX_RULE_LENGTH),
            trigger: { kind: 'file_glob' as const, pattern: file },
          },
        ]),
      ),
    );
    saveLessonsGraph(project.root(), graphOf(own));
    seedRecurring(FILES);
    const session = project.session('cap');
    const first = await project.recall({ ...patchOf(FILES), session_id: session });
    expect(count(first, 'RECURRENT FAILURE')).toBe(1);
    expect(first.length).toBeLessThanOrEqual(MAX_RECALL_PAYLOAD_CHARS);
    expect(blockIds(first)).toEqual([
      ['f1a', 'f1b', 'f2a', 'f2b', 'f3a', 'f3b', 'f4a'],
      ['f4b', 'f5a', 'f5b', 'f6a', 'f6b'],
    ]);
    // Files whose rules did not fit were not warned, so they still are next time.
    const second = await project.recall({ ...patchOf(FILES), session_id: session });
    expect(count(second, 'RECURRENT FAILURE')).toBe(1);
    expect(blockIds(second)).toEqual([['f5a', 'f5b', 'f6a', 'f6b', 'f7a', 'f7b', 'f8a'], ['f8b']]);
  });
});

/** Rule ids of each fenced block, in order. */
function blockIds(ctx: string): string[][] {
  return ctx
    .split(RECALL_BLOCK_CLOSE)
    .slice(0, -1)
    .map((block) => [...block.matchAll(/^- \[([^\]]+)\] /gm)].map((m) => m[1]!));
}

describe('repeat-failure warning without a session id', () => {
  it('does not repeat the covering rule in the recall body', async () => {
    const rule = 'Edit src with care.';
    saveLessonsGraph(
      project.root(),
      graphOf({ l1: { rule, trigger: { kind: 'file_glob', pattern: 'src/**' } } }),
    );
    seedRecurring(['src/x.ts']);
    const ctx = await project.recall({
      hook_event_name: 'PreToolUse',
      tool_input: { file_path: 'src/x.ts' },
    });
    expect(ctx).toContain('RECURRENT FAILURE');
    expect(count(ctx, rule)).toBe(1);
    const delivered = readOutcomeLog(project.root()).filter((e) => e.kind === 'delivered');
    expect(delivered).toEqual([
      expect.objectContaining({ lessonId: 'l1', contextKey: 'file:src/x.ts' }),
    ]);
  });
});
