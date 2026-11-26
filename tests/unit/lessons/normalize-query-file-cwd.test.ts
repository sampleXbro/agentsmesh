import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeRecallFile } from '../../../src/lessons/normalize-query-file.js';

/**
 * A relative `--file` typed in a sub folder must be read like a shell reads it:
 * from the cwd. A project-relative path keeps working when it names a real file
 * (or a folder that only exists project-relative), so older callers do not break.
 */

let root: string;
let cwd: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-norm-cwd-')));
  cwd = join(root, 'src', 'cli');
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const touch = (...parts: string[]): void => {
  const path = join(root, ...parts);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '');
};

describe('normalizeRecallFile — relative path from a sub folder', () => {
  it('reads an existing cwd-relative file from the cwd', () => {
    touch('src', 'cli', 'foo.ts');
    expect(normalizeRecallFile('foo.ts', root, cwd)).toBe('src/cli/foo.ts');
  });

  it('reads a file that does not exist yet from the cwd', () => {
    expect(normalizeRecallFile('foo.ts', root, cwd)).toBe('src/cli/foo.ts');
  });

  it('keeps a project-relative path that names an existing file', () => {
    touch('src', 'cli', 'foo.ts');
    expect(normalizeRecallFile('src/cli/foo.ts', root, cwd)).toBe('src/cli/foo.ts');
  });

  it('prefers the project-relative file when both readings exist', () => {
    touch('foo.ts');
    touch('src', 'cli', 'foo.ts');
    expect(normalizeRecallFile('foo.ts', root, cwd)).toBe('foo.ts');
  });

  it('takes the cwd-relative file when only it exists', () => {
    touch('src', 'cli', 'foo.ts');
    expect(normalizeRecallFile('./foo.ts', root, cwd)).toBe('src/cli/foo.ts');
  });

  it('keeps a new project-relative path whose folder only exists project-relative', () => {
    expect(normalizeRecallFile('src/cli/new.ts', root, cwd)).toBe('src/cli/new.ts');
  });

  it('reads a new path in a new folder from the cwd', () => {
    expect(normalizeRecallFile('fresh/dir/new.ts', root, cwd)).toBe('src/cli/fresh/dir/new.ts');
  });

  it('reads a ../ path from the cwd', () => {
    touch('src', 'util', 'a.ts');
    expect(normalizeRecallFile('../util/a.ts', root, cwd)).toBe('src/util/a.ts');
  });

  it('accepts a backslash path', () => {
    touch('src', 'cli', 'sub', 'foo.ts');
    expect(normalizeRecallFile('sub\\foo.ts', root, cwd)).toBe('src/cli/sub/foo.ts');
  });
});

describe('normalizeRecallFile — cwd cases that change nothing', () => {
  it('leaves an absolute path alone', () => {
    expect(normalizeRecallFile(join(root, 'src', 'cli', 'foo.ts'), root, cwd)).toBe(
      'src/cli/foo.ts',
    );
  });

  it('treats a cwd equal to the project root as before', () => {
    expect(normalizeRecallFile('src/cli/foo.ts', root, root)).toBe('src/cli/foo.ts');
  });

  it('treats a cwd outside the project root as before', () => {
    const other = realpathSync(mkdtempSync(join(tmpdir(), 'am-norm-other-')));
    try {
      expect(normalizeRecallFile('src/cli/foo.ts', root, other)).toBe('src/cli/foo.ts');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('keeps the old two-argument behavior', () => {
    expect(normalizeRecallFile('foo.ts', root)).toBe('foo.ts');
  });
});

describe('normalizeRecallFile — symlinked project root', () => {
  it.skipIf(process.platform === 'win32')(
    'reads a relative path from a cwd reached through the symlink',
    () => {
      const link = join(realpathSync(tmpdir()), `am-norm-link-${process.pid}`);
      symlinkSync(root, link);
      try {
        expect(normalizeRecallFile('foo.ts', root, join(link, 'src', 'cli'))).toBe(
          'src/cli/foo.ts',
        );
      } finally {
        rmSync(link, { force: true });
      }
    },
  );
});
