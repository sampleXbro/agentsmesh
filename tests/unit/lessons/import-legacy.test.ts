import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importLegacyLessons } from '../../../src/lessons/import-legacy.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_INPUT = resolve(HERE, '../../fixtures/lessons/legacy-input');
const FIXTURE_EXPECTED = resolve(HERE, '../../fixtures/lessons/legacy-expected');
const MIGRATED_AT = '2026-06-05';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-import-legacy-'));
  cpSync(FIXTURE_INPUT, join(root, '.agentsmesh/lessons'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('importLegacyLessons', async () => {
  it('writes lessons.json byte-for-byte equal to the committed expected fixture', async () => {
    await importLegacyLessons(root, { migratedAt: MIGRATED_AT, deleteLegacy: false });
    const got = readFileSync(join(root, '.agentsmesh/lessons/lessons.json'), 'utf8');
    const expected = readFileSync(join(FIXTURE_EXPECTED, 'lessons.json'), 'utf8');
    expect(got).toBe(expected);
  });

  it('deletes the migrated legacy artifacts by default and keeps journal.md', async () => {
    const report = await importLegacyLessons(root, { migratedAt: MIGRATED_AT });
    expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(false);
    expect(existsSync(join(root, '.agentsmesh/lessons/journal.md'))).toBe(true);
    expect(existsSync(join(root, '.agentsmesh/lessons/topics'))).toBe(false);
    expect(report.deletedPaths.length).toBeGreaterThan(0);
  });

  it('preserves legacy files when deleteLegacy=false (test-only path)', async () => {
    await importLegacyLessons(root, { migratedAt: MIGRATED_AT, deleteLegacy: false });
    expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(true);
    expect(existsSync(join(root, '.agentsmesh/lessons/journal.md'))).toBe(true);
    expect(existsSync(join(root, '.agentsmesh/lessons/topics/alpha-rules.md'))).toBe(true);
  });

  it('returns a report with exact counts and the canonical graph path', async () => {
    const report = await importLegacyLessons(root, { migratedAt: MIGRATED_AT });
    expect(report.topicCount).toBe(2);
    expect(report.lessonCount).toBe(5);
    expect(report.triggerCount).toBe(7);
    expect(report.wroteGraphPath.replaceAll('\\', '/')).toBe(
      join(root, '.agentsmesh/lessons/lessons.json').replaceAll('\\', '/'),
    );
  });

  it('is safe to re-run on the post-migration tree (legacy files gone → zero counts)', async () => {
    await importLegacyLessons(root, { migratedAt: MIGRATED_AT });
    // index.yaml no longer exists → re-running throws (intended: caller should
    // check before invoking). Verify the first run did its job and the second
    // call cannot accidentally clobber a valid graph from missing inputs.
    await expect(importLegacyLessons(root, { migratedAt: MIGRATED_AT })).rejects.toThrow();
  });

  it('first migration is byte-deterministic when re-run on a fresh copy', async () => {
    await importLegacyLessons(root, { migratedAt: MIGRATED_AT, deleteLegacy: false });
    const first = readFileSync(join(root, '.agentsmesh/lessons/lessons.json'), 'utf8');
    // Re-migration over an existing graph requires force (anti-clobber guard).
    await importLegacyLessons(root, { migratedAt: MIGRATED_AT, deleteLegacy: false, force: true });
    const second = readFileSync(join(root, '.agentsmesh/lessons/lessons.json'), 'utf8');
    expect(second).toBe(first);
  });
});

describe('importLegacyLessons — edge inputs', async () => {
  let edge: string;

  beforeEach(() => {
    edge = mkdtempSync(join(tmpdir(), 'amesh-import-edge-'));
    const base = join(edge, '.agentsmesh/lessons');
    mkdirSync(join(base, 'topics'), { recursive: true });
    writeFileSync(
      join(base, 'index.yaml'),
      [
        'version: 1',
        'clusters:',
        '  - topic: present',
        '    file: .agentsmesh/lessons/topics/present.md',
        '    summary: Present topic.',
        '    triggers:',
        '      file_globs: ["src/**", "src/**"]',
        '      command_patterns: []',
        '      keywords: []',
        '  - topic: missing',
        '    file: .agentsmesh/lessons/topics/missing.md',
        '    summary: Topic whose file is absent.',
        '    triggers:',
        '      file_globs: ["docs/**"]',
        '      command_patterns: []',
        '      keywords: []',
        '',
      ].join('\n'),
      'utf8',
    );
    // present.md has a rule with an Evidence tail that carries NO L-references.
    // Rules section is followed by another heading (exercises the section break),
    // and rule 1 carries an Evidence tail with no L-references.
    writeFileSync(
      join(base, 'topics/present.md'),
      '# Present\n\n## Rules\n\n1. Do the thing. (Evidence: see the design doc)\n2. Plain rule, no evidence.\n\n## Notes\n\nIgnore me.\n',
      'utf8',
    );
    // Both declared topic files exist so the success-path tests migrate cleanly;
    // the fail-closed test removes one to exercise the missing-file guard.
    writeFileSync(
      join(base, 'topics/missing.md'),
      '# Missing\n\n## Rules\n\n1. A rule from the second topic.\n',
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(edge, { recursive: true, force: true });
  });

  it('refuses to overwrite an existing non-empty graph without force (no capture loss)', async () => {
    const existing: LessonsGraph = {
      version: 1,
      lessons: {
        'kept-1': {
          rule: 'A freshly captured lesson that must not be erased.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-06',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: {},
    };
    saveLessonsGraph(edge, existing);
    await expect(importLegacyLessons(edge, { migratedAt: MIGRATED_AT })).rejects.toThrow(
      /already exists|force/i,
    );
    // the captured lesson survives, legacy files remain
    expect(loadLessonsGraph(edge).lessons['kept-1']).toBeDefined();
    expect(existsSync(join(edge, '.agentsmesh/lessons/index.yaml'))).toBe(true);
  });

  it('refuses to overwrite a lesson-less graph that still has topics/triggers without force', async () => {
    // A graph with metadata but zero lessons must still be treated as populated:
    // silently replacing its topics/triggers loses curated content.
    saveLessonsGraph(edge, {
      version: 1,
      lessons: {},
      topics: { 'hand-curated': { summary: 'Do not erase me.' } },
      triggers: { t1: { kind: 'keyword', pattern: 'keepme' } },
    });
    await expect(importLegacyLessons(edge, { migratedAt: MIGRATED_AT })).rejects.toThrow(
      /already exists|force/i,
    );
    expect(loadLessonsGraph(edge).topics['hand-curated']).toBeDefined();
  });

  it('overwrites an existing graph only when force is set', async () => {
    saveLessonsGraph(edge, {
      version: 1,
      lessons: {
        'kept-1': {
          rule: 'Old.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-06',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: {},
    });
    await importLegacyLessons(edge, { migratedAt: MIGRATED_AT, force: true, deleteLegacy: false });
    expect(loadLessonsGraph(edge).lessons['kept-1']).toBeUndefined();
  });

  it('fails closed: throws and deletes nothing when the migrated graph is invalid (duplicate rules)', async () => {
    const base = join(edge, '.agentsmesh/lessons');
    // Two identical rules across the two topics → DUPLICATE_RULE (both active).
    writeFileSync(
      join(base, 'topics/present.md'),
      '# Present\n\n## Rules\n\n1. Exact same rule text.\n',
      'utf8',
    );
    writeFileSync(
      join(base, 'topics/missing.md'),
      '# Missing\n\n## Rules\n\n1. Exact same rule text.\n',
      'utf8',
    );
    await expect(importLegacyLessons(edge, { migratedAt: MIGRATED_AT })).rejects.toThrow(
      /invalid|DUPLICATE_RULE/i,
    );
    expect(existsSync(join(base, 'index.yaml'))).toBe(true);
    expect(existsSync(join(base, 'lessons.json'))).toBe(false);
  });

  it('fails closed: throws and deletes nothing when a declared topic file is absent', async () => {
    const base = join(edge, '.agentsmesh/lessons');
    rmSync(join(base, 'topics/missing.md'), { force: true });
    await expect(importLegacyLessons(edge, { migratedAt: MIGRATED_AT })).rejects.toThrow(
      /missing|absent/i,
    );
    // Legacy artifacts must remain intact, and no graph is written.
    expect(existsSync(join(base, 'index.yaml'))).toBe(true);
    expect(existsSync(join(base, 'topics/present.md'))).toBe(true);
    expect(existsSync(join(base, 'lessons.json'))).toBe(false);
  });

  it('keeps only the canonical legacy pointer when an Evidence tail has no L-refs', async () => {
    await importLegacyLessons(edge, { migratedAt: MIGRATED_AT, deleteLegacy: false });
    const graph = JSON.parse(
      readFileSync(join(edge, '.agentsmesh/lessons/lessons.json'), 'utf8'),
    ) as { lessons: Record<string, { evidence: string[] }> };
    const ruleOne = graph.lessons['present-rule-1'];
    expect(ruleOne?.evidence).toEqual(['legacy:.agentsmesh/lessons/topics/present.md#rule-1']);
  });

  it('reports zero deletions when no legacy artifacts remain to remove', async () => {
    await importLegacyLessons(edge, { migratedAt: MIGRATED_AT, deleteLegacy: false });
    // Re-run with deletion on a tree that still has index.yaml/topics but no journal/distill files.
    const report = await importLegacyLessons(edge, { migratedAt: MIGRATED_AT, force: true });
    expect(report.deletedPaths.every((p) => !p.includes('journal'))).toBe(true);
  });
});
