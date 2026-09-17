import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseSuite,
  loadSuite,
  parseSuites,
  loadSuites,
} from '../../harness/lessons-recurrence/suite.js';

function validGraph(): unknown {
  return {
    version: 1,
    lessons: {
      'l-ts': {
        rule: 'r',
        topics: ['t'],
        triggers: ['tf'],
        evidence: ['e'],
        status: 'active',
        createdAt: '2026-01-01',
      },
      'l-md': {
        rule: 'r',
        topics: ['t'],
        triggers: ['tm'],
        evidence: ['e'],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
    topics: { t: { summary: 's' } },
    triggers: {
      tf: { kind: 'file_glob', pattern: 'src/**/*.ts' },
      tm: { kind: 'file_glob', pattern: '**/*.md' },
    },
  };
}

function validSuite(): Record<string, unknown> {
  return {
    topN: 10,
    graph: validGraph(),
    cases: [
      {
        id: 'edit-ts',
        query: { file: 'src/a.ts' },
        shouldRetrieve: ['l-ts'],
        shouldNotRetrieve: ['l-md'],
      },
      {
        id: 'edit-md',
        query: { file: 'x.md' },
        shouldRetrieve: ['l-md'],
        shouldNotRetrieve: ['l-ts'],
      },
    ],
  };
}

function cases(raw: Record<string, unknown>): Record<string, unknown>[] {
  return raw.cases as Record<string, unknown>[];
}

describe('parseSuite', () => {
  it('accepts a well-formed, completely-labeled suite', () => {
    const suite = parseSuite(validSuite());
    expect(suite.topN).toBe(10);
    expect(suite.graph.version).toBe(1);
    expect(suite.cases).toHaveLength(2);
  });

  it('rejects a case that does not label every lesson in the graph', () => {
    const raw = validSuite();
    cases(raw)[0]!.shouldNotRetrieve = [];
    expect(() => parseSuite(raw)).toThrow(/label every lesson/);
  });

  it('rejects a lesson labeled both should-retrieve and should-not-retrieve', () => {
    const raw = validSuite();
    cases(raw)[0]!.shouldNotRetrieve = ['l-md', 'l-ts'];
    expect(() => parseSuite(raw)).toThrow(/both shouldRetrieve and shouldNotRetrieve/);
  });

  it('rejects a reference to an unknown lesson id', () => {
    const raw = validSuite();
    cases(raw)[0]!.shouldRetrieve = ['l-ghost'];
    expect(() => parseSuite(raw)).toThrow(/unknown lesson l-ghost/);
  });

  it('rejects an unknown lesson id in should-not-retrieve', () => {
    const raw = validSuite();
    cases(raw)[0]!.shouldNotRetrieve = ['l-ghost'];
    expect(() => parseSuite(raw)).toThrow(/shouldNotRetrieve unknown lesson l-ghost/);
  });

  it('rejects expecting a non-active lesson to fire', () => {
    const raw = validSuite();
    (raw.graph as { lessons: Record<string, { status: string }> }).lessons['l-md']!.status =
      'deprecated';
    cases(raw)[1]!.shouldRetrieve = ['l-md'];
    cases(raw)[1]!.shouldNotRetrieve = ['l-ts'];
    expect(() => parseSuite(raw)).toThrow(/non-active lesson l-md/);
  });

  it('rejects duplicate case ids', () => {
    const raw = validSuite();
    cases(raw)[1]!.id = 'edit-ts';
    expect(() => parseSuite(raw)).toThrow(/duplicate case id: edit-ts/);
  });

  it('rejects a case query with no predicate', () => {
    const raw = validSuite();
    cases(raw)[0]!.query = {};
    expect(() => parseSuite(raw)).toThrow();
  });

  it('rejects a graph with an unsupported version (shape validation)', () => {
    const raw = validSuite();
    (raw.graph as { version: number }).version = 99;
    expect(() => parseSuite(raw)).toThrow();
  });

  it('accepts a per-case topN override', () => {
    const raw = validSuite();
    cases(raw)[0]!.topN = 1;
    expect(parseSuite(raw).cases[0]!.topN).toBe(1);
  });

  it('rejects a non-positive per-case topN', () => {
    const raw = validSuite();
    cases(raw)[0]!.topN = 0;
    expect(() => parseSuite(raw)).toThrow();
  });
});

function namedSuite(name: string): Record<string, unknown> {
  return { name, ...validSuite() };
}

describe('parseSuites', () => {
  it('accepts a valid multi-suite file', () => {
    const suites = parseSuites({ suites: [namedSuite('a'), namedSuite('b')] });
    expect(suites.map((s) => s.name)).toEqual(['a', 'b']);
    expect(suites[0]!.cases).toHaveLength(2);
  });

  it('rejects duplicate suite names', () => {
    expect(() => parseSuites({ suites: [namedSuite('dup'), namedSuite('dup')] })).toThrow(
      /duplicate suite name: dup/,
    );
  });

  it('propagates per-suite invariant violations', () => {
    const raw = { suites: [namedSuite('ok'), namedSuite('bad')] };
    (raw.suites[1]!.cases as Record<string, unknown>[])[0]!.shouldNotRetrieve = [];
    expect(() => parseSuites(raw)).toThrow(/label every lesson/);
  });
});

describe('loadSuites', () => {
  let dir: string;
  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('reads a multi-suite file from disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'am-recurrence-multi-'));
    const path = join(dir, 'hard-suites.json');
    writeFileSync(path, JSON.stringify({ suites: [namedSuite('a'), namedSuite('b')] }), 'utf8');
    expect(loadSuites(path)).toHaveLength(2);
  });
});

describe('loadSuite', () => {
  let dir: string;
  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('reads and validates a suite from disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'am-recurrence-'));
    const path = join(dir, 'suite.json');
    writeFileSync(path, JSON.stringify(validSuite()), 'utf8');
    const suite = loadSuite(path);
    expect(suite.cases).toHaveLength(2);
  });
});
