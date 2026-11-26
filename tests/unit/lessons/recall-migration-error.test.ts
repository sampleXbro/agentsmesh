import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recallLessons } from '../../../src/lessons/recall.js';
import { recallAlwaysLessons } from '../../../src/lessons/recall-always.js';

/**
 * A legacy store that cannot be migrated used to vanish into an empty catch: the
 * graph looked absent and nothing said why. Recall still degrades to empty (it
 * must never crash a blocking path) but now hands the reason to the caller.
 */

const MIGRATION_ERROR =
  'Legacy topic file path is outside .agentsmesh/lessons/: ../outside.md. ' +
  'Refusing to migrate (legacy artifacts left intact).';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-recall-migration-'));
  mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(
    join(root, '.agentsmesh', 'lessons', 'index.yaml'),
    [
      'version: 1',
      'clusters:',
      '  - topic: leak',
      '    file: "../outside.md"',
      '    summary: Leak topic.',
      '    triggers:',
      '      file_globs: ["src/**"]',
      '      command_patterns: []',
      '      keywords: []',
      '',
    ].join('\n'),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('recallLessons — failed legacy migration', () => {
  it('returns no lessons and says why the migration failed', async () => {
    const result = await recallLessons(root, { file: 'src/x.ts' }, { sessionId: 's' });
    expect(result).toEqual({
      lessons: [],
      totalMatches: 0,
      suppressed: 0,
      migrationError: MIGRATION_ERROR,
    });
  });

  it('does not try to migrate when autoMigrate is off', async () => {
    const result = await recallLessons(root, { file: 'src/x.ts' }, { autoMigrate: false });
    expect(result).toEqual({ lessons: [], totalMatches: 0, suppressed: 0 });
  });

  it('leaves the field out when no legacy store exists', async () => {
    rmSync(join(root, '.agentsmesh'), { recursive: true, force: true });
    const result = await recallLessons(root, { file: 'src/x.ts' });
    expect(result).toEqual({ lessons: [], totalMatches: 0, suppressed: 0 });
  });
});

describe('recallAlwaysLessons — failed legacy migration', () => {
  it('returns no lessons and says why the migration failed', async () => {
    expect(await recallAlwaysLessons(root)).toEqual({
      lessons: [],
      total: 0,
      suppressed: 0,
      migrationError: MIGRATION_ERROR,
    });
  });

  it('leaves the field out when autoMigrate is off', async () => {
    expect(await recallAlwaysLessons(root, { autoMigrate: false })).toEqual({
      lessons: [],
      total: 0,
      suppressed: 0,
    });
  });
});
