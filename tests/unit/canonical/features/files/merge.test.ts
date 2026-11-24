import { describe, it, expect } from 'vitest';
import { mergeCopiedFiles } from '../../../../../src/canonical/features/files/merge.js';

describe('mergeCopiedFiles', () => {
  it('lets overlay replace the same path', () => {
    const merged = mergeCopiedFiles(
      [{ path: '.gitignore', content: 'from-extend\n' }],
      [{ path: '.gitignore', content: 'from-local\n' }, { path: 'mise.toml', content: 'x\n' }],
    );
    expect(merged).toEqual([
      { path: '.gitignore', content: 'from-local\n' },
      { path: 'mise.toml', content: 'x\n' },
    ]);
  });

  it('returns undefined when both sides are empty', () => {
    expect(mergeCopiedFiles(undefined, undefined)).toBeUndefined();
    expect(mergeCopiedFiles([], [])).toBeUndefined();
  });
});
