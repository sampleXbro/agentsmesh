import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyFilesPick } from '../../../../../src/canonical/features/files/pick.js';
import type { CanonicalCopiedFile } from '../../../../../src/canonical/features/files/types.js';
import { logger } from '../../../../../src/utils/output/logger.js';

const FILES: CanonicalCopiedFile[] = [
  { path: '.gitignore', content: 'a\n' },
  { path: '.github/workflows/ci.yml', content: 'ci\n' },
  { path: '.github/workflows/release.yml', content: 'rel\n' },
  { path: 'mise.toml', content: 'x\n' },
  { path: 'eslint.config.js', content: 'e\n' },
  { path: 'eslint.config.local.js', content: 'local\n' },
  { path: 'packages/app/eslint.config.js', content: 'nested\n' },
];

describe('applyFilesPick', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps every file when patterns are omitted', () => {
    expect(applyFilesPick(FILES, undefined, 'ext')).toEqual(FILES);
  });

  it('selects a whole folder with dir/**', () => {
    const out = applyFilesPick(FILES, ['.github/**'], 'ext');
    expect(out.map((f) => f.path)).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
    ]);
  });

  it('matches exact paths only for slash-free literals without **', () => {
    const out = applyFilesPick(FILES, ['eslint.config.js'], 'ext');
    expect(out.map((f) => f.path)).toEqual(['eslint.config.js']);
  });

  it('matches at any depth with **/name', () => {
    const out = applyFilesPick(FILES, ['**/eslint.config.js'], 'ext');
    expect(out.map((f) => f.path).sort()).toEqual([
      'eslint.config.js',
      'packages/app/eslint.config.js',
    ]);
  });

  it('excludes with ! and does not restore with a later positive', () => {
    const out = applyFilesPick(
      FILES,
      ['.github/**', '!eslint.config.local.js', 'eslint.config.local.js'],
      'ext',
    );
    expect(out.map((f) => f.path)).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
    ]);
  });

  it('warns when a pattern matches nothing', () => {
    applyFilesPick(FILES, ['missing.toml'], 'tooling');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('pick pattern "missing.toml" matched no files from extend "tooling"'),
    );
  });
});
