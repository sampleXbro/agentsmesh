/**
 * lessons.json and its neighbours on disk: a UTF-8 BOM is read like the rest
 * of agentsmesh reads files, a read-only graph is not written over, the file
 * mode survives a save, a lock path that is a file gets a clear message, and
 * leftover temp files and stale lock folders are cleaned up.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLesson } from '../../../src/lessons/add.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import {
  graphFilePath,
  loadLessonsGraph,
  loadLessonsGraphResilient,
} from '../../../src/lessons/graph-store.js';
import { lessonsConfigWarning, loadRecallConfig } from '../../../src/lessons/recall-config.js';
import { isOutcomeLogEnabled } from '../../../src/lessons/telemetry.js';

const canChmod =
  process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;
const GRAPH: LessonsGraph = {
  version: 2,
  lessons: {},
  topics: { t: { summary: 'T.' } },
  triggers: {},
};
const input = { rule: 'Keep the graph readable.', topic: 't', triggers: { files: ['src/**'] } };
let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-graph-edges-'));
  dir = join(root, '.agentsmesh', 'lessons');
  mkdirSync(dir, { recursive: true });
  writeFileSync(graphFilePath(root), JSON.stringify(GRAPH));
});
afterEach(() => {
  if (existsSync(graphFilePath(root))) chmodSync(graphFilePath(root), 0o644);
  rmSync(root, { recursive: true, force: true });
});

describe('a UTF-8 BOM', () => {
  it('in lessons.json is read, and a save writes the file without it', async () => {
    writeFileSync(graphFilePath(root), `\uFEFF${JSON.stringify(GRAPH)}`);
    expect(loadLessonsGraph(root).topics.t).toEqual({ summary: 'T.' });
    expect(loadLessonsGraphResilient(root).status).toBe('ok');
    await addLesson(root, input);
    expect(readFileSync(graphFilePath(root), 'utf8').startsWith('\uFEFF')).toBe(false);
  });

  it('in config.json is read, so its settings apply', () => {
    writeFileSync(join(dir, 'config.json'), '\uFEFF{"outcomeLog": false, "recallLimit": 3}');
    expect(isOutcomeLogEnabled({}, root)).toBe(false);
    expect(loadRecallConfig(root).limit).toBe(3);
    expect(lessonsConfigWarning(root)).toBeNull();
  });
});

describe('file mode', () => {
  it.skipIf(!canChmod)('refuses to write a read-only lessons.json', async () => {
    chmodSync(graphFilePath(root), 0o444);
    const before = readFileSync(graphFilePath(root), 'utf8');
    await expect(addLesson(root, input)).rejects.toThrow(
      '.agentsmesh/lessons/lessons.json is read-only, so nothing was saved. Make it writable ' +
        '(chmod u+w .agentsmesh/lessons/lessons.json) to change lessons.',
    );
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(before);
    expect(statSync(graphFilePath(root)).mode & 0o777).toBe(0o444);
  });

  it.skipIf(!canChmod)('keeps the file mode across a save', async () => {
    chmodSync(graphFilePath(root), 0o600);
    await addLesson(root, input);
    expect(statSync(graphFilePath(root)).mode & 0o777).toBe(0o600);
  });
});

describe('lock and leftovers', () => {
  it('names a lock path that is a file instead of failing with ENOTDIR', async () => {
    writeFileSync(join(dir, '.lessons.lock'), 'not a folder');
    const err = await addLesson(root, input).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(
      /\.agentsmesh\/lessons\/\.lessons\.lock is a file, but agentsmesh keeps its lock there as a folder\. Delete it and run the command again\.$/,
    );
  });

  it('removes old temp files and stale lock folders, and keeps fresh ones', async () => {
    const old = new Date(Date.now() - 5 * 60 * 1000);
    const oldTmp = join(dir, 'lessons.json.4242.tmp');
    const oldStale = join(dir, '.lessons.lock.0f3c.stale');
    const freshTmp = join(dir, 'outcome-log.jsonl.4343.tmp');
    writeFileSync(oldTmp, '{}');
    mkdirSync(oldStale);
    writeFileSync(freshTmp, '{}');
    utimesSync(oldTmp, old, old);
    utimesSync(oldStale, old, old);

    await addLesson(root, input);

    expect([existsSync(oldTmp), existsSync(oldStale), existsSync(freshTmp)]).toEqual([
      false,
      false,
      true,
    ]);
  });
});
