/**
 * A change the lessons write barrier refuses (an unsafe trigger, a broken
 * supersede chain) is the caller's input to fix, so it comes back as
 * VALIDATION_FAILED with the finding codes in `details` — never as IO_ERROR,
 * and never with the message mangled by the path redactor.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { McpError } from '../../../../src/mcp/errors.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';
import { writeRefusalError } from '../../../../src/mcp/handlers/lessons-guards.js';
import { mutateLessonsGraph } from '../../../../src/lessons/mutate.js';
import type { Lesson } from '../../../../src/lessons/graph-schema.js';
import { graphFilePath, saveLessonsGraph } from '../../../../src/lessons/graph-store.js';

let root: string;
let ctx: McpContext;
let before: string;

const lesson = (rule: string, extra: Partial<Lesson> = {}): Lesson => ({
  rule,
  topics: ['t'],
  triggers: ['g'],
  evidence: [],
  status: 'active',
  createdAt: '2026-01-01',
  ...extra,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-mcp-refusal-'));
  writeFileSync(join(root, 'agentsmesh.yaml'), 'version: 1\n');
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
  saveLessonsGraph(root, {
    version: 2,
    topics: { t: { summary: 'T.' } },
    triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    lessons: {
      a: lesson('Rule A.'),
      b: lesson('Rule B.'),
      old: lesson('Old.', { status: 'superseded', supersededBy: 'b' }),
      dep: lesson('Dep.', { status: 'deprecated' }),
    },
  });
  before = readFileSync(graphFilePath(root), 'utf8');
  ctx = { projectRoot: root } as McpContext;
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

async function refusal(p: Promise<unknown>): Promise<McpError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(err instanceof McpError)) throw new Error(`expected McpError, got ${String(err)}`);
  return err;
}

/** A refusal that is readable, typed by its finding codes, and wrote nothing. */
function expectRefused(err: McpError, codes: string[]): void {
  expect(err.code).toBe('VALIDATION_FAILED');
  expect(err.details).toEqual({ code: codes[0], codes });
  expect(err.message).not.toContain('<redacted>');
  expect(err.message).not.toContain('mutateLessonsGraph');
  // One period per sentence (an ellipsis like `[...]` is fine).
  expect(err.message).not.toMatch(/(?<!\.)\.\.(?!\.)/);
  for (const code of codes) expect(err.message).toContain(`${code}: `);
  expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
}

const add = (triggers: { trigger_files?: string; trigger_commands?: string }): Promise<unknown> =>
  lessonsHandlers.add(ctx, { rule: 'Never run the thing unguarded.', topic: 't', ...triggers });

describe('lessons_add refused by the write barrier', () => {
  it('an over-expanding brace glob is UNSAFE_GLOB_PATTERN', async () => {
    const err = await refusal(add({ trigger_files: `src/${'{a,b}'.repeat(20)}` }));
    expectRefused(err, ['UNSAFE_GLOB_PATTERN']);
    expect(err.message).toMatch(/^lessons_add: /);
  });
});

describe('write-barrier refusal of a regex trigger', () => {
  // `lessons_add` drops a dead command trigger before the barrier; a raw
  // mutation still reaches it, and the mapping must read the same way.
  it.each([
    ['an invalid regex', 'abc[', 'INVALID_TRIGGER_PATTERN', 'Unterminated character class'],
    ['a backreference', '(a)\\1', 'UNSAFE_TRIGGER_PATTERN', 'backreference'],
    ['a lookahead', 'git (?=push)', 'UNSAFE_TRIGGER_PATTERN', 'lookaround'],
  ])('%s maps to VALIDATION_FAILED and says why', async (_label, pattern, code, reason) => {
    const raw = await mutateLessonsGraph(root, (g) => {
      g.triggers['x'] = { kind: 'command_pattern', pattern };
      g.lessons['a']!.triggers.push('x');
    }).then(
      () => undefined,
      (e: unknown) => e,
    );
    const err = writeRefusalError('lessons_add', raw);
    expect(err).not.toBeNull();
    expectRefused(err!, [code]);
    expect(err!.message).toContain(reason);
    // A nested quantifier runs in linear time, so it is not named as a cause.
    expect(err!.message).not.toMatch(/\(a\+\)\+ or/);
  });

  it('leaves any other error alone', () => {
    expect(writeRefusalError('lessons_add', new Error('EACCES: permission denied'))).toBeNull();
    expect(writeRefusalError('lessons_add', 'not an error')).toBeNull();
  });
});

describe('lessons_deprecate refused by the write barrier', () => {
  it('a lesson superseding itself is SELF_SUPERSEDED', async () => {
    const err = await refusal(lessonsHandlers.deprecate(ctx, { id: 'a', superseded_by: 'a' }));
    expectRefused(err, ['SELF_SUPERSEDED']);
    expect(err.message).toMatch(/^lessons_deprecate: /);
  });

  it('a supersede cycle lists every finding code once', async () => {
    const err = await refusal(lessonsHandlers.deprecate(ctx, { id: 'b', superseded_by: 'old' }));
    expectRefused(err, ['INACTIVE_SUPERSEDER', 'SUPERSEDE_CYCLE']);
  });

  it('an inactive superseder is INACTIVE_SUPERSEDER', async () => {
    const err = await refusal(lessonsHandlers.deprecate(ctx, { id: 'a', superseded_by: 'dep' }));
    expectRefused(err, ['INACTIVE_SUPERSEDER']);
  });

  it('retiring the replacement of a superseded lesson is INACTIVE_SUPERSEDER', async () => {
    const err = await refusal(lessonsHandlers.deprecate(ctx, { id: 'b' }));
    expectRefused(err, ['INACTIVE_SUPERSEDER']);
    expect(err.message).toContain('Lesson "old" is superseded by "b"');
  });
});
