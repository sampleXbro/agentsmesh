import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doQuery } from '../../../../src/cli/commands/lessons-handlers.js';
import type { LessonsFlags } from '../../../../src/cli/commands/lessons-helpers.js';
import type { LessonsQueryData } from '../../../../src/cli/commands/lessons-types.js';
import type { Lesson, LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../../src/lessons/graph-store.js';

/**
 * `--always` rows are printed first, so the ranked rows must fit what is left of
 * the printed-output cap. Only what is printed may count as delivered.
 */

const make = (rule: string, extra: Partial<Lesson>): Lesson => ({
  rule,
  topics: ['t'],
  triggers: [],
  evidence: [],
  status: 'active',
  createdAt: '2026-06-01',
  ...extra,
});

function seed(root: string): void {
  const lessons: LessonsGraph['lessons'] = {};
  for (const i of [0, 1]) {
    lessons[`al${i}`] = make(`Always ${i} `.padEnd(1000, 'x'), { scope: 'always' });
  }
  for (let i = 0; i < 30; i += 1) {
    lessons[`r${String(i).padStart(2, '0')}`] = make(`Rule ${i} `.padEnd(2000, 'x'), {
      triggers: ['g'],
    });
  }
  saveLessonsGraph(root, {
    version: 2,
    topics: { t: { summary: 'T.' } },
    triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    lessons,
  });
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-query-always-payload-'));
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
  seed(root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function query(flags: LessonsFlags): LessonsQueryData {
  const result = doQuery(flags, root, false);
  if (result.subcommand !== 'query') throw new Error(`unexpected ${result.subcommand}`);
  return result.data;
}
const ids = (data: LessonsQueryData): string[] => data.lessons.map((l) => l.id);

describe('lessons query --always with a size-capped payload', () => {
  const flags = { always: true, file: 'src/x.ts', all: true, session: 'always-payload' };

  it('fits the ranked rows into what the always-on rows leave', () => {
    const first = query(flags);
    const ranked = ids(first).filter((id) => id.startsWith('r'));
    expect(ids(first).slice(0, 2)).toEqual(['al0', 'al1']);
    expect(ranked).toEqual(Array.from({ length: 14 }, (_, i) => `r${String(i).padStart(2, '0')}`));
  });

  it('marks the cut rule as not yet delivered', () => {
    query(flags);
    const second = query(flags);
    expect(second.suppressed).toBe(2 + 14);
    expect(ids(second)[0]).toBe('r14');
    expect(second.lessons).toHaveLength(15);
  });

  it('never cuts --format json', () => {
    expect(query({ ...flags, format: 'json' }).lessons).toHaveLength(2 + 30);
  });
});
