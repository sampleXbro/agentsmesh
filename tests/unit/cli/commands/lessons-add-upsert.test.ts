import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsCommandResult } from '../../../../src/cli/commands/lessons-types.js';
import { loadLessonsGraph } from '../../../../src/lessons/graph-store.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-add-upsert-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const NEW_TOPIC = { topic: 'c', 'new-topic': true, 'topic-summary': 'C.' };

function addData(r: LessonsCommandResult): Extract<LessonsCommandResult, { subcommand: 'add' }> {
  if (r.subcommand !== 'add') throw new Error(`expected add, got ${r.subcommand}`);
  return r;
}

describe('lessons add — re-add reports what it changed', () => {
  it('reports the scope promotion instead of "(no change)"', async () => {
    await runLessons({ ...NEW_TOPIC, 'trigger-file': 'src/a.ts' }, ['add', 'seed'], root);
    const r = addData(
      await runLessons(
        { topic: 'c', 'trigger-file': 'src/a.ts', scope: 'always' },
        ['add', 'seed'],
        root,
      ),
    );
    expect(r.exitCode).toBe(0);
    expect(r.data.changes).toEqual(['scope set to always']);
  });

  it('reports the evidence each parallel re-add stored', async () => {
    await runLessons({ ...NEW_TOPIC, 'trigger-file': 'src/a.ts' }, ['add', 'seed'], root);
    const refs = Array.from({ length: 8 }, (_, i) => `commit:${i}`);
    const results = await Promise.all(
      refs.map((ref) =>
        runLessons(
          { topic: 'c', 'trigger-file': 'src/a.ts', evidence: ref },
          ['add', 'seed'],
          root,
        ),
      ),
    );
    expect(results.map((r) => addData(r).data.changes)).toEqual(
      refs.map((ref) => [`evidence added: ${ref}`]),
    );
    expect([...loadLessonsGraph(root).lessons['c-seed']!.evidence].sort()).toEqual(refs);
  });
});

describe('lessons add — dead --trigger-cmd', () => {
  it('keeps the live trigger and warns about the dropped pattern (exit 0)', async () => {
    const r = addData(
      await runLessons(
        { ...NEW_TOPIC, 'trigger-file': 'src/index.ts', 'trigger-cmd': '(?<=a)b' },
        ['add', 'R'],
        root,
      ),
    );
    expect(r.exitCode).toBe(0);
    expect(r.data.warnings.filter((w) => w.code === 'DEAD_COMMAND_PATTERN')).toHaveLength(1);
  });

  it('rejects a lone dead pattern as UNRECALLABLE_LESSON (exit 2)', async () => {
    const r = await runLessons({ ...NEW_TOPIC, 'trigger-cmd': '[' }, ['add', 'R'], root);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('no effective trigger');
    expect(r.error).toContain('"["');
  });
});
