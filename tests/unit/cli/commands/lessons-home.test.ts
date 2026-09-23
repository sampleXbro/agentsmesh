/**
 * `~/.agentsmesh` is the global config folder. `lessons add` or `import-md`
 * run in the home folder must refuse instead of creating a lessons graph there,
 * where every project under home would then pick it up.
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { lessonsPaths } from '../../../../src/lessons/paths.js';

const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: (): string => fakeHome.dir };
});

let base: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'amesh-cli-home-')));
  fakeHome.dir = join(base, 'home');
  mkdirSync(fakeHome.dir, { recursive: true });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const ADD = { topic: 't', 'new-topic': true, 'topic-summary': 'T.', 'trigger-file': 'src/x.ts' };

describe('lessons in the home folder', () => {
  it('add refuses and creates no graph in ~/.agentsmesh', async () => {
    const r = await runLessons(ADD, ['add', 'A rule.'], fakeHome.dir);
    expect(r.exitCode).toBe(2);
    expect(r.error ?? '').toMatch(/home folder/);
    expect(existsSync(lessonsPaths(fakeHome.dir).graph)).toBe(false);
  });

  it('import-md refuses in the home folder too', async () => {
    const r = await runLessons({}, ['import-md'], fakeHome.dir);
    expect(r.exitCode).toBe(2);
    expect(existsSync(lessonsPaths(fakeHome.dir).graph)).toBe(false);
  });

  it('add still works in a project folder under home', async () => {
    const proj = join(fakeHome.dir, 'work', 'proj');
    mkdirSync(proj, { recursive: true });
    const r = await runLessons(ADD, ['add', 'A rule.'], proj);
    expect(r.exitCode).toBe(0);
    expect(existsSync(lessonsPaths(proj).graph)).toBe(true);
  });
});
