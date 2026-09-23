import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { doMergeDriver } from '../../../../src/cli/commands/lessons-merge-driver-handler.js';
import type { Lesson, LessonsGraph } from '../../../../src/lessons/graph-schema.js';

let dir: string;
let base: string;
let ours: string;
let theirs: string;

const graph = (over: Partial<LessonsGraph> = {}): LessonsGraph => ({
  version: 1,
  lessons: {},
  topics: { t: { summary: 'T.' } },
  triggers: {},
  ...over,
});
const pretty = (g: LessonsGraph): string => `${JSON.stringify(g, null, 2)}\n`;
const lesson = (rule: string): Lesson => ({
  rule,
  topics: ['t'],
  triggers: [],
  evidence: [],
  status: 'active',
  createdAt: '2026-06-01',
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amesh-mergedriver-'));
  base = join(dir, 'base.json');
  ours = join(dir, 'ours.json');
  theirs = join(dir, 'theirs.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('doMergeDriver', () => {
  it('three-way unions the files, writes the result to ours, exit 0', () => {
    writeFileSync(base, JSON.stringify(graph()));
    writeFileSync(ours, JSON.stringify(graph({ lessons: { a: lesson('A.') } })));
    writeFileSync(theirs, JSON.stringify(graph({ lessons: { c: lesson('C.') } })));

    const r = doMergeDriver([base, ours, theirs]);
    expect(r.exitCode).toBe(0);
    const merged = JSON.parse(readFileSync(ours, 'utf8')) as LessonsGraph;
    expect(Object.keys(merged.lessons).sort()).toEqual(['a', 'c']);
    // Written through the canonical serializer (trailing newline, sorted keys).
    expect(readFileSync(ours, 'utf8').endsWith('}\n')).toBe(true);
  });

  it('writes a textual conflict (never ours as-is) when a side is unparseable, exit 1', () => {
    writeFileSync(base, pretty(graph()));
    writeFileSync(ours, 'our side is not json\n');
    writeFileSync(theirs, pretty(graph({ lessons: { c: lesson('Incoming C.') } })));

    const r = doMergeDriver([base, ours, theirs]);
    expect(r.exitCode).toBe(1);
    const written = readFileSync(ours, 'utf8');
    expect(written).toMatch(/^<{7} /m);
    expect(written).toMatch(/^>{7} /m);
    expect(written).toContain('our side is not json');
    expect(written).toContain('Incoming C.');
    expect(r.error).toContain('.agentsmesh/lessons/lessons.json');
    expect(r.error).toContain('this branch');
    expect(r.error).not.toContain(dir.replaceAll('\\', '/'));
    expect(r.error).not.toContain(dir);
  });

  it('writes a textual conflict when a side is valid JSON but fails the graph schema', () => {
    writeFileSync(base, pretty(graph()));
    writeFileSync(ours, pretty(graph({ lessons: { a: lesson('Ours A.') } })));
    writeFileSync(theirs, JSON.stringify({ version: 1, lessons: 'not-an-object' }, null, 2));
    const r = doMergeDriver([base, ours, theirs]);
    expect(r.exitCode).toBe(1);
    const written = readFileSync(ours, 'utf8');
    expect(written).toMatch(/^<{7} /m);
    expect(written).toContain('Ours A.');
    expect(written).toContain('not-an-object');
    expect(r.error).toContain('incoming branch');
  });

  it('asks for an agentsmesh upgrade when a side uses a newer graph schema', () => {
    writeFileSync(base, pretty(graph()));
    writeFileSync(ours, pretty(graph({ lessons: { a: lesson('Ours A.') } })));
    writeFileSync(
      theirs,
      pretty({
        ...graph({ lessons: { c: lesson('Future C.') } }),
        version: 99,
      } as unknown as LessonsGraph),
    );
    const r = doMergeDriver([base, ours, theirs]);
    expect(r.exitCode).toBe(1);
    const written = readFileSync(ours, 'utf8');
    expect(written).toContain('Future C.');
    expect(written).toContain('Ours A.');
    expect(r.error).toMatch(/upgrade agentsmesh/i);
    expect(r.error).toContain('version 99');
    expect(r.error).toContain('.agentsmesh/lessons/lessons.json');
    expect(r.error).toContain('agentsmesh lessons resolve');
  });

  it('stamps the newer of the two readable versions', () => {
    writeFileSync(base, pretty(graph()));
    writeFileSync(ours, pretty(graph({ lessons: { a: lesson('A.') } })));
    writeFileSync(theirs, pretty({ ...graph({ lessons: { c: lesson('C.') } }), version: 2 }));
    expect(doMergeDriver([base, ours, theirs]).exitCode).toBe(0);
    expect((JSON.parse(readFileSync(ours, 'utf8')) as LessonsGraph).version).toBe(2);
  });

  it('exits 1 on missing arguments', () => {
    expect(doMergeDriver([]).exitCode).toBe(1);
  });

  it('never runs legacy migration mid-merge, even over a broken legacy store', async () => {
    mkdirSync(join(dir, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(join(dir, '.agentsmesh/lessons/index.yaml'), ':: not yaml ::\n- [', 'utf8');
    writeFileSync(base, pretty(graph()));
    writeFileSync(ours, pretty(graph({ lessons: { a: lesson('A.') } })));
    writeFileSync(theirs, pretty(graph({ lessons: { c: lesson('C.') } })));

    const r = await runLessons({}, ['merge-driver', base, ours, theirs], dir);
    expect(r.exitCode).toBe(0);
    expect(Object.keys((JSON.parse(readFileSync(ours, 'utf8')) as LessonsGraph).lessons)).toEqual([
      'a',
      'c',
    ]);
  });
});
