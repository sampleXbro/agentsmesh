import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { captureLogPath } from '../../../../src/lessons/capture-telemetry.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../../src/lessons/graph-store.js';
import { recallLogPath, TELEMETRY_ENV } from '../../../../src/lessons/telemetry.js';

/**
 * Telemetry logs are diagnostics. With telemetry on and a log that cannot be
 * written, `lessons query` and `lessons add` must still do their real work
 * and exit 0.
 */

const noChmod = process.platform === 'win32' || process.getuid?.() === 0;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-telemetry-ro-'));
  vi.stubEnv(TELEMETRY_ENV, '1');
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
  saveLessonsGraph(root, graph);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const graph: LessonsGraph = {
  version: 2,
  lessons: {
    f: {
      rule: 'File-triggered rule.',
      topics: ['t'],
      triggers: ['t-file'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    },
  },
  topics: { t: { summary: 'T.' } },
  triggers: { 't-file': { kind: 'file_glob', pattern: 'src/**' } },
};

function readOnlyFile(path: string): void {
  writeFileSync(path, '', 'utf8');
  chmodSync(path, 0o444);
}

describe('telemetry on, log not writable', () => {
  it.skipIf(noChmod)('lessons query still returns its lessons and exits 0', async () => {
    readOnlyFile(recallLogPath(root));
    const r = await runLessons({ file: 'src/foo.ts' }, ['query'], root);
    if (r.subcommand !== 'query') throw new Error('expected query');
    expect(r.exitCode).toBe(0);
    expect(r.data.lessons.map((l) => l.id)).toEqual(['f']);
  });

  it.skipIf(noChmod)('lessons add still saves the lesson and exits 0', async () => {
    readOnlyFile(captureLogPath(root));
    const r = await runLessons(
      { rule: 'Strip CRLF from emitted scripts.', topic: 't', 'trigger-file': 'src/x/*.ts' },
      ['add'],
      root,
    );
    if (r.subcommand !== 'add') throw new Error('expected add');
    expect(r.exitCode).toBe(0);
    expect(loadLessonsGraph(root).lessons[r.data.id]?.rule).toBe(
      'Strip CRLF from emitted scripts.',
    );
  });
});
