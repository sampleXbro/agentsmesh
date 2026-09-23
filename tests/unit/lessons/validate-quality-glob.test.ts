import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLesson } from '../../../src/lessons/add.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { collectInvalidTriggerPatterns } from '../../../src/lessons/validate-quality.js';
import { validateLessonsGraph, type ValidationFinding } from '../../../src/lessons/validate.js';

const HOSTILE_EXTGLOB = '**/' + '+(*)'.repeat(20) + 'ZZZ';

function graphWithGlob(pattern: string): LessonsGraph {
  return {
    version: 2,
    lessons: {
      'a-rule': {
        rule: 'A rule.',
        topics: ['t'],
        triggers: ['t-glob'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: { 't-glob': { kind: 'file_glob', pattern } },
  };
}

describe('collectInvalidTriggerPatterns — file_glob safety', () => {
  it('flags a nested-extglob file_glob as UNSAFE_GLOB_PATTERN', () => {
    const findings: ValidationFinding[] = [];
    collectInvalidTriggerPatterns(graphWithGlob(HOSTILE_EXTGLOB), findings);
    expect(findings).toEqual([
      expect.objectContaining({ level: 'error', code: 'UNSAFE_GLOB_PATTERN', triggerId: 't-glob' }),
    ]);
  });

  it('flags an over-long file_glob', () => {
    const findings: ValidationFinding[] = [];
    collectInvalidTriggerPatterns(graphWithGlob(`src/${'a'.repeat(300)}/*.ts`), findings);
    expect(findings.map((f) => f.code)).toEqual(['UNSAFE_GLOB_PATTERN']);
  });

  it.each(['src/**/*.ts', '**/*.md', '.github/workflows/*.yml', 'src/{a,b}/**', './src/x.ts'])(
    'accepts the legitimate glob %s',
    (pattern) => {
      const findings: ValidationFinding[] = [];
      collectInvalidTriggerPatterns(graphWithGlob(pattern), findings);
      expect(findings).toEqual([]);
    },
  );

  it('leaves backslash globs to BACKSLASH_GLOB_PATTERN (one finding, not two)', () => {
    const report = validateLessonsGraph(graphWithGlob('src\\x.ts'));
    const codes = report.findings.filter((f) => f.level === 'error').map((f) => f.code);
    expect(codes).toEqual(['BACKSLASH_GLOB_PATTERN']);
  });

  it('flags the hostile graph promptly', () => {
    const start = performance.now();
    const report = validateLessonsGraph(graphWithGlob(HOSTILE_EXTGLOB));
    expect(performance.now() - start).toBeLessThan(200);
    expect(report.ok).toBe(false);
  });
});

describe('capture rejects an unsafe file_glob (transactional write barrier)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'amesh-glob-safety-'));
    saveLessonsGraph(root, {
      version: 2,
      lessons: {},
      topics: { t: { summary: 'T.' } },
      triggers: {},
    });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses to persist a lesson whose file_glob is outside the safe subset', async () => {
    await expect(
      addLesson(root, {
        rule: 'Never do the thing in hostile files.',
        topic: 't',
        triggers: { files: [HOSTILE_EXTGLOB] },
      }),
    ).rejects.toThrow(/UNSAFE_GLOB_PATTERN/);
    expect(loadLessonsGraph(root).lessons).toEqual({});
    expect(loadLessonsGraph(root).triggers).toEqual({});
  });

  it('refuses promptly when a file list is supplied (the CLI/MCP capture path)', async () => {
    const knownPaths = new Set(Array.from({ length: 50 }, (_, i) => `src/d${i}/f-${i}.ts`));
    const start = performance.now();
    await expect(
      addLesson(
        root,
        { rule: 'Never do the thing.', topic: 't', triggers: { files: [HOSTILE_EXTGLOB] } },
        { knownPaths },
      ),
    ).rejects.toThrow(/UNSAFE_GLOB_PATTERN/);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
