/**
 * The legacy lessons store (index.yaml + topics/*.md + journal.md, up to 0.22)
 * migrates without losing rules: wrapped and bullet rules are kept, a topic can
 * use `## Lessons`, list items it cannot place stop the migration with nothing
 * changed, journal.md is kept for review, and the recall hook never migrates
 * (#138).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { useTempProject } from '../../helpers/temp-project.js';
import { maybeAutoMigrateLessons } from '../../../src/lessons/auto-migrate.js';
import { runLessons } from '../../../src/cli/commands/lessons.js';

const LESSONS = '.agentsmesh/lessons';
const INDEX =
  'version: 1\nclusters:\n  - topic: testing\n    file: .agentsmesh/lessons/topics/testing.md\n' +
  '    summary: Testing.\n    triggers:\n      file_globs: []\n      command_patterns: []\n' +
  '      keywords: [testing]\n';

const { root, write } = useTempProject('am-legacy-lossless-');

const has = (rel: string): boolean => existsSync(join(root(), rel));
const rules = (): string[] => {
  const graph = JSON.parse(readFileSync(join(root(), LESSONS, 'lessons.json'), 'utf8')) as {
    lessons: Record<string, { rule: string }>;
  };
  return Object.values(graph.lessons).map((lesson) => lesson.rule);
};

function legacy(topic: string): void {
  write('agentsmesh.yaml', 'version: 1\ntargets: [claude-code]\n');
  write(`${LESSONS}/index.yaml`, INDEX);
  write(`${LESSONS}/topics/testing.md`, topic);
  write(
    `${LESSONS}/journal.md`,
    '# Journal\n- L2 Never run migrations against prod from a laptop\n',
  );
}

const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
afterEach(() => {
  if (realStdin !== undefined) Object.defineProperty(process, 'stdin', realStdin);
});

describe('legacy lessons migration', () => {
  it('keeps wrapped and bullet rules, and keeps journal.md', async () => {
    legacy(
      '# T\n\n## Rules\n\n1. Rule one (Evidence L1)\n2. Wrapped rule\n   with key detail.\n' +
        '- Bullet rule\n',
    );

    expect(await maybeAutoMigrateLessons(root())).toBe(true);

    expect(rules()).toEqual(['Rule one', 'Wrapped rule with key detail.', 'Bullet rule']);
    expect([
      has(`${LESSONS}/index.yaml`),
      has(`${LESSONS}/topics`),
      has(`${LESSONS}/journal.md`),
    ]).toEqual([false, false, true]);
  });

  it('reads rules under a ## Lessons heading and keeps same-number rules from two sections', async () => {
    legacy('# T\n\n## Rules\n1. Alpha\n2. Beta\n\n## Lessons\n1. Gamma\n');

    await maybeAutoMigrateLessons(root());

    expect(rules()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('refuses, changing nothing, when a list item sits outside a rules section', async () => {
    legacy('# T\n\n## Rules\n1. Alpha\n\n## Notes\n- Stray note\n');

    await expect(maybeAutoMigrateLessons(root())).rejects.toThrow(
      'Legacy lessons were not migrated: .agentsmesh/lessons/topics/testing.md line 7 is a list ' +
        'item outside a "## Rules" or "## Lessons" section. Move it under one of them or delete ' +
        'it, then run `agentsmesh lessons import-md`. Nothing was changed.',
    );
    expect([
      has(`${LESSONS}/lessons.json`),
      has(`${LESSONS}/index.yaml`),
      has(`${LESSONS}/topics/testing.md`),
      has(`${LESSONS}/journal.md`),
    ]).toEqual([false, true, true, true]);
  });

  it('is never run by the lessons hook', async () => {
    legacy('# T\n\n## Rules\n1. Alpha\n');
    const payload = {
      session_id: 'm',
      hook_event_name: 'SessionStart',
      cwd: root(),
      source: 'startup',
    };
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: Readable.from([Buffer.from(JSON.stringify(payload))]),
    });

    await runLessons({}, ['hook'], root());

    expect([has(`${LESSONS}/lessons.json`), has(`${LESSONS}/index.yaml`)]).toEqual([false, true]);
  });
});
