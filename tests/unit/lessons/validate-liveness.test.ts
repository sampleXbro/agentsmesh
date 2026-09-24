import { describe, expect, it, vi } from 'vitest';
import type { GitPathHistory } from '../../../src/lessons/git-path-history.js';
import { projectFilesOf } from '../../../src/lessons/project-files.js';
import {
  collectDeadFileGlobs,
  collectRunnerAnchoredPatterns,
  fileGlobLiveness,
} from '../../../src/lessons/validate-liveness.js';
import type { ValidationFinding } from '../../../src/lessons/validate.js';
import { filesWith, graphWith } from '../../helpers/lessons-liveness-fixture.js';

const NO_HISTORY: GitPathHistory = {
  tracked: new Set(),
  deleted: new Set(),
  renamedAway: new Set(),
};

describe('fileGlobLiveness', () => {
  it('splits globs matching nothing on disk into dead (git proves removal) and pending (no proof)', () => {
    const g = graphWith({
      't-live': { kind: 'file_glob', pattern: 'src/here/*.ts' },
      't-moved': { kind: 'file_glob', pattern: 'src/gone/**' },
      't-new': { kind: 'file_glob', pattern: 'src/api/refunds.ts' },
    });
    const out = fileGlobLiveness(g, filesWith(['src/here/a.ts'], ['src/gone/x.ts']));
    expect([...out.dead]).toEqual(['t-moved']);
    expect([...out.pending]).toEqual(['t-new']);
  });

  it('proves nothing dead from a plain set (no git evidence): every missing glob is pending', () => {
    const g = graphWith({ 't-glob': { kind: 'file_glob', pattern: 'src/gone/**' } });
    const out = fileGlobLiveness(g, new Set(['README.md']));
    expect([...out.dead]).toEqual([]);
    expect([...out.pending]).toEqual(['t-glob']);
  });

  it('judges only the given trigger ids, so a capture never reads git for unrelated globs', () => {
    const g = graphWith({
      't-mine': { kind: 'file_glob', pattern: 'src/a.ts' },
      't-other': { kind: 'file_glob', pattern: 'dist/cli.js' },
    });
    const gitHistory = vi.fn(() => NO_HISTORY);
    const out = fileGlobLiveness(g, projectFilesOf(['src/a.ts'], gitHistory), ['t-mine']);
    expect(out).toEqual({ dead: new Set(), pending: new Set() });
    expect(gitHistory).not.toHaveBeenCalled();
  });

  it('never reads git when every glob matches a file on disk', () => {
    const g = graphWith({ 't-glob': { kind: 'file_glob', pattern: 'src/**' } });
    const gitHistory = vi.fn(() => NO_HISTORY);
    const out = fileGlobLiveness(g, projectFilesOf(['src/a.ts'], gitHistory));
    expect(out).toEqual({ dead: new Set(), pending: new Set() });
    expect(gitHistory).not.toHaveBeenCalled();
  });
});

describe('collectDeadFileGlobs', () => {
  it('flags a file_glob (on an active lesson) whose paths git history renamed away', () => {
    const g = graphWith({ 't-glob': { kind: 'file_glob', pattern: 'src/gone/**' } });
    const f: ValidationFinding[] = [];
    collectDeadFileGlobs(g, f, filesWith(['src/here/a.ts', 'README.md'], ['src/gone/a.ts']));
    expect(f).toEqual([
      expect.objectContaining({ code: 'DEAD_FILE_GLOB', level: 'warning', triggerId: 't-glob' }),
    ]);
    expect(f[0]!.message).toContain('git history shows its path was renamed or deleted');
  });

  it('does not flag a pending glob (path not created yet, or ignored output not built)', () => {
    const g = graphWith({ 't-glob': { kind: 'file_glob', pattern: 'dist/cli.js' } });
    const f: ValidationFinding[] = [];
    collectDeadFileGlobs(g, f, filesWith(['src/a.ts']));
    expect(f).toEqual([]);
  });

  it('does not flag a file_glob that still matches at least one file', () => {
    const g = graphWith({ 't-glob': { kind: 'file_glob', pattern: 'src/**' } });
    const f: ValidationFinding[] = [];
    collectDeadFileGlobs(g, f, new Set(['src/here/a.ts']));
    expect(f).toEqual([]);
  });

  it('ignores file_globs referenced only by a non-active lesson', () => {
    const g = graphWith({ 't-glob': { kind: 'file_glob', pattern: 'src/gone/**' } });
    g.lessons.L = { ...g.lessons.L, status: 'deprecated' };
    const f: ValidationFinding[] = [];
    collectDeadFileGlobs(g, f, new Set(['README.md']));
    expect(f).toEqual([]);
  });

  it('ignores non-file_glob triggers', () => {
    const g = graphWith({ 't-cmd': { kind: 'command_pattern', pattern: 'vitest' } });
    const f: ValidationFinding[] = [];
    collectDeadFileGlobs(g, f, new Set());
    expect(f).toEqual([]);
  });
});

describe('collectRunnerAnchoredPatterns', () => {
  it('flags a command_pattern anchored to a single runner', () => {
    for (const pattern of [
      '^pnpm test',
      '^npx vitest run',
      '^npm run build',
      '^yarn x',
      '^bun y',
    ]) {
      const g = graphWith({ 't-cmd': { kind: 'command_pattern', pattern } });
      const f: ValidationFinding[] = [];
      collectRunnerAnchoredPatterns(g, f);
      expect(f, pattern).toContainEqual(
        expect.objectContaining({ code: 'RUNNER_ANCHORED_PATTERN', level: 'warning' }),
      );
    }
  });

  it('does not flag a runner-agnostic or alternation pattern', () => {
    for (const pattern of ['vitest run', '\\bvitest\\b', '(pnpm|npx) test', 'git commit']) {
      const g = graphWith({ 't-cmd': { kind: 'command_pattern', pattern } });
      const f: ValidationFinding[] = [];
      collectRunnerAnchoredPatterns(g, f);
      expect(f, pattern).toEqual([]);
    }
  });

  it('ignores runner-anchored patterns referenced only by a non-active lesson', () => {
    const g = graphWith({ 't-cmd': { kind: 'command_pattern', pattern: '^pnpm test' } });
    g.lessons.L = { ...g.lessons.L, status: 'deprecated' };
    const f: ValidationFinding[] = [];
    collectRunnerAnchoredPatterns(g, f);
    expect(f).toEqual([]);
  });
});
