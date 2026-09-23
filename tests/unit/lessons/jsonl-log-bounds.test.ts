/**
 * The JSONL logs stay readable and bounded: an append after a file that lacks
 * its final newline starts a new line (it used to glue `{...}{...}` and lose
 * both), the size cap counts bytes (a single 3 MB line used to stay forever and
 * be re-read on every append), and a reader reads only a bounded tail.
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendJsonl, readJsonl } from '../../../src/lessons/jsonl-log.js';

let dir: string;
let path: string;
const opts = { maxRecords: 5000, trimTriggerBytes: 2_000_000 };
const any = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-jsonl-bounds-'));
  path = join(dir, 'log.jsonl');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('appendJsonl', () => {
  it('starts a new line when the file does not end with one', () => {
    writeFileSync(path, '{"a":1}');
    appendJsonl(path, { b: 2 }, opts);
    expect(readFileSync(path, 'utf8')).toBe('{"a":1}\n{"b":2}\n');
  });

  it('drops a line bigger than the cap instead of keeping it forever', () => {
    writeFileSync(path, `${JSON.stringify({ big: 'x'.repeat(3_000_000) })}\n`);
    appendJsonl(path, { n: 1 }, opts);
    expect(readFileSync(path, 'utf8')).toBe('{"n":1}\n');
  });

  it('trims by bytes to half the cap, keeping the newest records in order', () => {
    const medium = (i: number): string => JSON.stringify({ i, pad: 'p'.repeat(100_000) });
    writeFileSync(path, `${Array.from({ length: 30 }, (_, i) => medium(i)).join('\n')}\n`);
    appendJsonl(path, { i: 30 }, opts);
    expect(statSync(path).size).toBeLessThanOrEqual(opts.trimTriggerBytes / 2);
    const kept = readJsonl(path, any).map((r) => r.i);
    expect(kept.at(-1)).toBe(30);
    expect(kept).toEqual([...kept].sort((a, b) => Number(a) - Number(b)));
    expect(kept.length).toBeLessThan(31);
  });
});

describe('readJsonl', () => {
  it('reads only the last maxBytes of the file', () => {
    writeFileSync(path, `${JSON.stringify({ big: 'x'.repeat(50_000) })}\n{"a":1}\n{"b":2}\n`);
    expect(readJsonl(path, any, { maxBytes: 1_000 })).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('reads the whole file when it fits', () => {
    writeFileSync(path, '{"a":1}\n{"b":2}\n');
    expect(readJsonl(path, any, { maxBytes: 1_000 })).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
