import { describe, it, expect } from 'vitest';
import { globNarrowness, isBroadFileGlob } from '../../../src/lessons/glob-breadth.js';

describe('globNarrowness', () => {
  it('scores an exact file path at the maximum', () => {
    expect(globNarrowness('src/lessons/recall.ts')).toBe(1);
    expect(globNarrowness('./src/lessons/recall.ts')).toBe(1);
  });

  it('ranks a file class below an exact path but above a subtree', () => {
    const exact = globNarrowness('src/targets/cursor/index.ts');
    const fileClass = globNarrowness('src/targets/*/index.ts');
    const dirFiles = globNarrowness('src/lessons/*.ts');
    const subtree = globNarrowness('src/lessons/**/*.ts');
    const wide = globNarrowness('src/**');
    expect(exact).toBeGreaterThan(fileClass);
    expect(fileClass).toBeGreaterThan(dirFiles);
    expect(dirFiles).toBeGreaterThan(subtree);
    expect(subtree).toBeGreaterThan(wide);
  });

  it('rewards a deeper literal prefix', () => {
    expect(globNarrowness('src/targets/cursor/**')).toBeGreaterThan(globNarrowness('src/**'));
  });

  it('scores a bare globstar at zero and stays within [0,1]', () => {
    expect(globNarrowness('**')).toBe(0);
    expect(globNarrowness('**/*')).toBe(0);
    for (const p of ['', 'a', 'a/b/c.ts', '*', 'src/**/*.ts', '**']) {
      const n = globNarrowness(p);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('treats an empty pattern as broadest', () => {
    expect(globNarrowness('')).toBe(0);
  });

  it('scores a negated glob at zero: it matches every other path', () => {
    expect(globNarrowness('!vendor/lock.json')).toBe(0);
    expect(globNarrowness('!src/lessons/*.ts')).toBe(0);
  });
});

describe('isBroadFileGlob', () => {
  it('flags repo-wide patterns', () => {
    expect(isBroadFileGlob('**')).toBe(true);
    expect(isBroadFileGlob('**/*.ts')).toBe(true);
    expect(isBroadFileGlob('src/**')).toBe(true);
  });

  it('leaves a useful file class alone', () => {
    expect(isBroadFileGlob('src/targets/*/index.ts')).toBe(false);
    expect(isBroadFileGlob('src/lessons/*.ts')).toBe(false);
    expect(isBroadFileGlob('src/lessons/recall.ts')).toBe(false);
    expect(isBroadFileGlob('src/targets/cursor/**')).toBe(false);
  });

  it('flags a negated glob, which fires on every file but one', () => {
    expect(isBroadFileGlob('!vendor/lock.json')).toBe(true);
  });
});

describe('validate: BROAD_FILE_GLOB', () => {
  it('warns for a repo-wide glob on an active lesson and leaves a file class alone', async () => {
    const { validateLessonsGraph } = await import('../../../src/lessons/validate.js');
    const graph = {
      version: 1 as const,
      lessons: {
        wide: {
          rule: 'Always prefer explicit strict null comparisons in this repo.',
          topics: ['t'],
          triggers: ['wide'],
          evidence: [],
          status: 'active' as const,
          createdAt: '2026-06-01',
        },
        narrow: {
          rule: 'Register every new target descriptor in the catalog index.',
          topics: ['t'],
          triggers: ['narrow'],
          evidence: [],
          status: 'active' as const,
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: {
        wide: { kind: 'file_glob' as const, pattern: 'src/**' },
        narrow: { kind: 'file_glob' as const, pattern: 'src/lessons/*.ts' },
      },
    };
    const codes = validateLessonsGraph(graph, {}).findings.filter(
      (f) => f.code === 'BROAD_FILE_GLOB',
    );
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatchObject({ level: 'warning', triggerId: 'wide' });
    expect(codes[0]!.message).toContain('src/**');
  });

  it('warns for a negated glob on an active lesson', async () => {
    const { validateLessonsGraph } = await import('../../../src/lessons/validate.js');
    const graph = {
      version: 1 as const,
      lessons: {
        negated: {
          rule: 'Never hand-edit the vendored lock file.',
          topics: ['t'],
          triggers: ['neg'],
          evidence: [],
          status: 'active' as const,
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: { neg: { kind: 'file_glob' as const, pattern: '!vendor/lock.json' } },
    };
    const findings = validateLessonsGraph(graph, {}).findings.filter(
      (f) => f.code === 'BROAD_FILE_GLOB',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'warning', triggerId: 'neg' });
    expect(findings[0]!.message).toContain('!vendor/lock.json');
  });
});
