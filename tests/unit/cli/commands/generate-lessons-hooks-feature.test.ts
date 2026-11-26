/**
 * `generate` projects hooks only when `hooks` is in `features`. A project with
 * lessons set up but hooks off would never get the recall hook in any tool, and
 * nothing said so. It now warns once per run, with the fix.
 */

import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLessonsMaintenance } from '../../../../src/cli/commands/generate-lessons.js';
import { logger } from '../../../../src/utils/output/logger.js';
import { isolateGit } from '../../../helpers/lessons-merge-repo.js';

const WARNING =
  "The lessons recall hook will not reach any tool: `hooks` is not in `features` in agentsmesh.yaml. Add `hooks` to `features` in agentsmesh.yaml, then run 'agentsmesh generate'.";

let root: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gen-lessons-hooks-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function setUp(features: string, lessons: boolean): void {
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    `version: 1\ntargets:\n  - claude-code\n${features}`,
    'utf8',
  );
  if (!lessons) return;
  mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh', 'lessons', 'config.json'), '{}\n', 'utf8');
}

function spies(): { warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> } {
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  return {
    warn: vi.spyOn(logger, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(logger, 'error').mockImplementation(() => {}),
  };
}

describe('runLessonsMaintenance — hooks feature off', () => {
  it.each(['generate', 'check', 'dry-run'] as const)(
    'warns once with the fix on a %s run and does not fail it',
    (mode) => {
      setUp('features:\n  - rules\n  - mcp\n', true);
      const { warn, error } = spies();
      expect(runLessonsMaintenance(root, mode)).toBe(0);
      expect(warn.mock.calls).toEqual([[WARNING]]);
      expect(error).not.toHaveBeenCalled();
    },
  );

  it('stays quiet when hooks is in features', () => {
    setUp('features:\n  - rules\n  - hooks\n', true);
    const { warn } = spies();
    expect(runLessonsMaintenance(root, 'generate')).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet when features is not set, since every feature is then on', () => {
    setUp('', true);
    const { warn } = spies();
    runLessonsMaintenance(root, 'generate');
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet when lessons are not set up, even with hooks off', () => {
    setUp('features:\n  - rules\n', false);
    const { warn } = spies();
    expect(runLessonsMaintenance(root, 'generate')).toBe(0);
    expect(runLessonsMaintenance(root, 'check')).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('names agentsmesh.local.yaml when that file turns hooks off', () => {
    setUp('features:\n  - rules\n  - hooks\n', true);
    writeFileSync(join(root, 'agentsmesh.local.yaml'), 'features:\n  - rules\n', 'utf8');
    const { warn } = spies();
    runLessonsMaintenance(root, 'generate');
    expect(warn.mock.calls).toEqual([
      [WARNING.replaceAll('agentsmesh.yaml', 'agentsmesh.local.yaml')],
    ]);
  });
});
