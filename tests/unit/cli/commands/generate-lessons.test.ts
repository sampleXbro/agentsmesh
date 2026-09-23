/**
 * `generate` keeps a team's lessons healthy, not only the person who ran init.
 *
 * - An unreadable graph (a merge conflict, corruption, a newer schema) used to
 *   leave generate and `generate --check` green while recall was silently off.
 *   `--check` is what this repo's own CI runs, so it must fail there; a normal
 *   run warns instead of blocking unrelated work.
 * - Projects without lessons are untouched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLessonsMaintenance } from '../../../../src/cli/commands/generate-lessons.js';
import { logger } from '../../../../src/utils/output/logger.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gen-lessons-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function conflictedGraph(): void {
  mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(
    join(root, '.agentsmesh', 'lessons', 'lessons.json'),
    '{\n<<<<<<< HEAD\n  "a": 1\n=======\n  "b": 2\n>>>>>>> theirs\n}\n',
  );
}

describe('runLessonsMaintenance', () => {
  it('fails generate --check when the graph has a merge conflict', () => {
    conflictedGraph();
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    expect(runLessonsMaintenance(root, 'check')).toBe(1);
    expect(error.mock.calls.flat().join(' ')).toMatch(/conflict/i);
  });

  it('warns on a normal run instead of blocking unrelated work', () => {
    conflictedGraph();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(runLessonsMaintenance(root, 'generate')).toBe(0);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/conflict/i);
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
