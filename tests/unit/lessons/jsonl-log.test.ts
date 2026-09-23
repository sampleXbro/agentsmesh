import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendJsonl, capJsonl, logExists, readJsonl } from '../../../src/lessons/jsonl-log.js';
import { isRecord } from '../../../src/utils/types/guards.js';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amesh-jsonl-'));
  path = join(dir, 'nested', 'log.jsonl');
});

afterEach(() => {
  chmodSync(dir, 0o755);
  if (existsSync(dirname(path))) chmodSync(dirname(path), 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const opts = { maxRecords: 5, trimTriggerBytes: 2_000_000 };
const isN = (v: unknown): v is { n: number } => isRecord(v) && typeof v.n === 'number';
// Root ignores file modes, and Windows has no POSIX modes.
const noChmod = process.platform === 'win32' || process.getuid?.() === 0;

describe('appendJsonl', () => {
  it('creates the parent directory and appends one JSON line per call', () => {
    appendJsonl(path, { n: 1 }, opts);
    appendJsonl(path, { n: 2 }, opts);
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).n).toBe(1);
    expect(JSON.parse(lines[1]!).n).toBe(2);
  });

  it('truncates to the last maxRecords once the byte trigger is crossed', () => {
    // A tiny byte trigger forces a trim check on every append.
    const tight = { maxRecords: 3, trimTriggerBytes: 1 };
    for (let i = 0; i < 10; i++) appendJsonl(path, { n: i }, tight);
    const rows = readJsonl(path, isN);
    expect(rows.map((r) => r.n)).toEqual([7, 8, 9]);
  });

  it.skipIf(noChmod)('never throws when the log file is read-only', () => {
    appendJsonl(path, { n: 1 }, opts);
    chmodSync(path, 0o444);
    expect(() => appendJsonl(path, { n: 2 }, opts)).not.toThrow();
    expect(readJsonl(path, isN).map((r) => r.n)).toEqual([1]);
  });

  it.skipIf(noChmod)('never throws when the log directory is read-only', () => {
    mkdirSync(dirname(path), { recursive: true });
    chmodSync(dirname(path), 0o555);
    expect(() => appendJsonl(path, { n: 1 }, opts)).not.toThrow();
    expect(existsSync(path)).toBe(false);
  });

  it('never throws when the log path is a directory', () => {
    mkdirSync(path, { recursive: true });
    expect(() => appendJsonl(path, { n: 1 }, opts)).not.toThrow();
  });
});

describe('readJsonl', () => {
  it('returns [] when the log is absent', () => {
    expect(readJsonl(path, isN)).toEqual([]);
  });

  it('reads valid rows and skips a torn final line (crash mid-append)', () => {
    appendJsonl(path, { n: 7 }, opts);
    appendFileSync(path, '{"n": 9, "trunca', 'utf8');
    const rows = readJsonl(path, isN);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.n).toBe(7);
  });

  it('skips lines that parse but are not objects, and rows the guard rejects', () => {
    mkdirSync(dirname(path), { recursive: true });
    const lines = ['null', '42', '"text"', '[1]', 'true', '{"n":"one"}', '{}', '{"n":3}'];
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
    expect(readJsonl(path, isN)).toEqual([{ n: 3 }]);
  });

  it('returns [] when the log path is a directory', () => {
    mkdirSync(path, { recursive: true });
    expect(readJsonl(path, isN)).toEqual([]);
  });

  it.skipIf(noChmod)('returns [] when the log cannot be read', () => {
    appendJsonl(path, { n: 1 }, opts);
    chmodSync(path, 0o000);
    expect(readJsonl(path, isN)).toEqual([]);
  });
});

describe('capJsonl', () => {
  it('is a no-op when the log is absent', () => {
    expect(() => capJsonl(path, 5)).not.toThrow();
    expect(existsSync(path)).toBe(false);
  });

  it('keeps the file intact when under the record cap', () => {
    for (let i = 0; i < 3; i++) appendJsonl(path, { n: i }, opts);
    capJsonl(path, 5);
    expect(readJsonl(path, isN)).toHaveLength(3);
  });

  it('truncates to the last N records and leaves a trailing newline, no temp file', () => {
    for (let i = 0; i < 10; i++) appendJsonl(path, { n: i }, opts);
    capJsonl(path, 4);
    const rows = readJsonl(path, isN);
    expect(rows.map((r) => r.n)).toEqual([6, 7, 8, 9]);
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
    expect(existsSync(`${path}.${process.pid}.tmp`)).toBe(false);
  });
});

describe('logExists', () => {
  it('distinguishes an absent log from a present one', () => {
    expect(logExists(path)).toBe(false);
    appendJsonl(path, { n: 1 }, opts);
    expect(logExists(path)).toBe(true);
  });
});
