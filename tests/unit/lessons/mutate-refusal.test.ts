/**
 * The write barrier's refusal is typed and carries its findings, so the MCP
 * tools map it without parsing text; the message reads cleanly (no "..").
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyGraph } from '../../../src/lessons/graph-schema.js';
import { LessonsWriteRefusedError, mutateLessonsGraph } from '../../../src/lessons/mutate.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-mutate-refusal-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function refused(): Promise<unknown> {
  return mutateLessonsGraph(root, (g) => {
    Object.assign(g, emptyGraph());
    g.triggers.bad = { kind: 'command_pattern', pattern: '(a)\\1' };
    g.topics.t = { summary: 'T.' };
    g.lessons.l = {
      rule: 'R.',
      topics: ['t'],
      triggers: ['bad'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    };
  }).then(
    () => null,
    (err: unknown) => err,
  );
}

describe('mutateLessonsGraph write refusal', () => {
  it('throws a typed error carrying the new findings', async () => {
    const err = await refused();
    expect(err).toBeInstanceOf(LessonsWriteRefusedError);
    const codes = (err as LessonsWriteRefusedError).findings.map((f) => f.code);
    expect(codes).toContain('UNSAFE_TRIGGER_PATTERN');
  });

  it('never ends a finding with a doubled period', async () => {
    const err = await refused();
    expect((err as Error).message).not.toMatch(/\.\./);
  });
});
