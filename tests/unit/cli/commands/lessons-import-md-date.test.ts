/**
 * `import-md --migrated-at` must be a real calendar date. `2026-13-45` used to
 * be stamped onto every imported lesson, and `not-a-date` failed with an
 * internal SCHEMA_INVALID message.
 */

import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { graphFilePath, loadLessonsGraph } from '../../../../src/lessons/graph-store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY = resolve(HERE, '../../../fixtures/lessons/legacy-input');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-import-date-'));
  cpSync(LEGACY, join(root, '.agentsmesh/lessons'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('lessons import-md --migrated-at', () => {
  it.each(['2026-13-45', '2026-02-30', 'not-a-date', '2026-06-05T25:00:00Z', '20260605'])(
    'rejects %j (exit 2) and migrates nothing',
    async (value) => {
      const r = await runLessons({ 'migrated-at': value }, ['import-md'], root);
      expect(r.exitCode).toBe(2);
      expect(r.error).toBe(
        `--migrated-at must be a real date, like 2026-06-05 or 2026-06-05T10:30:00Z (got ${JSON.stringify(value)}).`,
      );
      expect(existsSync(graphFilePath(root))).toBe(false);
      expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(true);
    },
  );

  it.each(['2024-02-29', '2026-06-05T10:30:00Z', '2026-06-05T10:30:00.123Z'])(
    'stamps the real date %j on every imported lesson',
    async (value) => {
      const r = await runLessons({ 'migrated-at': value }, ['import-md'], root);
      expect(r.exitCode).toBe(0);
      const dates = new Set(Object.values(loadLessonsGraph(root).lessons).map((l) => l.createdAt));
      expect([...dates]).toEqual([value]);
    },
  );
});
