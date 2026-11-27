/**
 * A catch-all file glob matches every file of a project, so a lesson carrying
 * it would be recalled on every edit. Capture refuses it; broader-but-bounded
 * globs stay advisory warnings.
 */

import { describe, expect, it } from 'vitest';
import { GLOB_PROBE_PATHS, isCatchAllGlob } from '../../../src/lessons/glob-breadth.js';

describe('isCatchAllGlob — globs that match every file', () => {
  it.each(['**', '**/*', '**/**', '**/**/*', './**', './**/*', '**/?*', '**/{*,x}'])(
    '%s is a catch-all',
    (pattern) => {
      expect(isCatchAllGlob(pattern)).toBe(true);
    },
  );

  it.each([
    ['*', 'matches only files in the project root'],
    ['*.*', 'matches only root files with an extension'],
    ['**/*.*', 'skips extensionless files such as LICENSE'],
    ['**/*.ts', 'one file type'],
    ['src/**', 'one directory'],
    ['src/**/*', 'one directory'],
    ['src/**/*.ts', 'one directory and file type'],
    ['src/cli/**/*.ts', 'one subsystem'],
    ['**/index.ts', 'one basename'],
    ['src/lib/use*Form*.ts', 'a file class'],
    ['**/*/**', 'needs at least one directory level'],
    ['{src,tests}/**', 'two directories'],
    ['!docs/**', 'a negated glob excludes the paths it names'],
    ['!**', 'a negated glob never matches everything'],
  ])('%s is not a catch-all (%s)', (pattern) => {
    expect(isCatchAllGlob(pattern)).toBe(false);
  });

  it('is false for a glob outside the safe subset (it never matches)', () => {
    expect(isCatchAllGlob('**/*(a|b)')).toBe(false);
    expect(isCatchAllGlob('{**,a.ts}')).toBe(false);
    expect(isCatchAllGlob('')).toBe(false);
  });

  it('probes with a fixed corpus that has root, nested, dot and extensionless files', () => {
    expect(GLOB_PROBE_PATHS).toEqual([
      'LICENSE',
      'package.json',
      '.gitignore',
      'src/index.ts',
      'src/lib/deep/nested/util.test.ts',
      '.github/workflows/ci.yml',
      'docs/guide/intro.md',
      'docs/my notes.txt',
      'assets/logo.png',
      'dist/app.min.js.map',
      'node_modules/pkg/index.js',
      'src/naïve/файл.ts',
    ]);
  });
});
