/**
 * `query` never crashes on a legacy store it cannot migrate, but it must say
 * why it returned nothing: it used to print only "(no matches)" and the
 * "run init --lessons" hint, hiding the failed migration.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';

let root: string;
const indexPath = (): string => join(root, '.agentsmesh', 'lessons', 'index.yaml');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-query-migration-'));
  mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(
    indexPath(),
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

describe('lessons query — failed legacy migration', () => {
  it('returns no lessons (exit 0) and says the migration failed, with the fix', async () => {
    const result = await runLessons({ file: 'src/x.ts' }, ['query'], root);

    expect(result.exitCode).toBe(0);
    if (result.subcommand !== 'query') throw new Error('expected a query result');
    expect(result.data.lessons).toEqual([]);
    expect(result.data.warning).toBe(
      'recall returned no lessons: the legacy lessons store (.agentsmesh/lessons/index.yaml) ' +
        'could not be migrated: Legacy topic file path is outside .agentsmesh/lessons/: ' +
        '../outside.md. Refusing to migrate (legacy artifacts left intact). Fix it, then run ' +
        '`agentsmesh lessons import-md`.',
    );
    expect(existsSync(indexPath())).toBe(true);
  });
});
