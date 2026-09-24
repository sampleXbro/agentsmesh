/**
 * `generate` keeps a team's lessons healthy, not only the person who ran init.
 *
 * - An unreadable graph (a merge conflict, corruption, a newer schema) used to
 *   leave generate and `generate --check` green while recall was silently off.
 *   `--check` is what this repo's own CI runs, so it must fail there; a normal
 *   run warns instead of blocking unrelated work.
 * - Projects without lessons are untouched.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLessonsMaintenance } from '../../../../src/cli/commands/generate-lessons.js';
import { logger } from '../../../../src/utils/output/logger.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../../helpers/lessons-graph-fixture.js';
import {
  driverDidNotRun,
  isolateGit,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../../helpers/lessons-merge-repo.js';
import { git } from '../../../helpers/temp-git-repo.js';

let root: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gen-lessons-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('runLessonsMaintenance', () => {
  it('fails generate --check when the graph has a merge conflict', () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    expect(runLessonsMaintenance(root, 'check')).toBe(1);
    expect(error.mock.calls.flat().join(' ')).toMatch(/conflict/i);
  });

  it('warns on a normal run instead of blocking unrelated work', () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(runLessonsMaintenance(root, 'generate')).toBe(0);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/conflict/i);
  });

  it('fails --check and warns on a run when git holds a one-sided lessons.json unmerged', () => {
    mergeLessonsBranches(root, root, TWO_CAPTURES);
    driverDidNotRun(root, root);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    expect(runLessonsMaintenance(root, 'check')).toBe(1);
    expect(error.mock.calls.flat().join(' ')).toContain('BEFORE `git add');
    expect(runLessonsMaintenance(root, 'generate')).toBe(0);
    expect(warn.mock.calls.flat().join(' ')).toContain('BEFORE `git add');
  });

  it('stays quiet about a merge driver the user set up themselves', () => {
    git(root, ['init', '--quiet']);
    writeFileSync(
      join(root, '.gitattributes'),
      '.agentsmesh/lessons/lessons.json merge=agentsmesh-lessons\n',
    );
    git(root, ['config', 'merge.agentsmesh-lessons.driver', 'my-own-driver %O %A %B']);
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    expect(runLessonsMaintenance(root, 'generate')).toBe(0);
    expect(info.mock.calls.flat().join(' ')).not.toContain('Kept your own');
  });

  it('leaves a project without lessons untouched', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    expect(runLessonsMaintenance(root, 'check')).toBe(0);
    expect(runLessonsMaintenance(root, 'generate')).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
