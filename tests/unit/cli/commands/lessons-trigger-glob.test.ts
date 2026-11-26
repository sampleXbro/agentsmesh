/**
 * `lessons add --trigger-file` typed in a folder below the project root reads
 * the glob like a shell does, using the same rule as recall `--file`: a literal
 * prefix that exists from the root keeps the root reading (older callers pass
 * that), else one that exists from the current folder moves onto that folder;
 * a path that exists nowhere is a file about to be created, so it moves too
 * (except when only the root-side parent folder exists).
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anchorTriggerGlob } from '../../../../src/cli/commands/lessons-trigger-glob.js';

let root: string;
let web: string;

function touch(rel: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), '');
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-trigger-glob-')));
  web = join(root, 'packages', 'web');
  mkdirSync(web, { recursive: true });
  mkdirSync(join(root, 'packages', 'shared'), { recursive: true });
  touch('package.json');
  touch('packages/web/vite.config.ts');
  touch('packages/web/src/app.ts');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('anchorTriggerGlob — a file that exists in the current folder', () => {
  it.each([
    ['vite.config.ts', 'packages/web/vite.config.ts'],
    ['./vite.config.ts', 'packages/web/vite.config.ts'],
    ['src/**/*.ts', 'packages/web/src/**/*.ts'],
    ['src/{app,main}.ts', 'packages/web/src/{app,main}.ts'],
    ['!src/gen/**', '!packages/web/src/gen/**'],
    ['src\\app.ts', 'packages/web/src/app.ts'],
  ])('moves %j to %j', (glob, expected) => {
    expect(anchorTriggerGlob(glob, root, web)).toBe(expected);
  });

  it('reads ../ from the current folder', () => {
    touch('packages/shared/index.ts');
    expect(anchorTriggerGlob('../shared/index.ts', root, web)).toBe('packages/shared/index.ts');
  });
});

describe('anchorTriggerGlob — the project-relative reading wins when it exists', () => {
  it('keeps a file that exists from the root', () => {
    expect(anchorTriggerGlob('package.json', root, web)).toBe('package.json');
  });

  it('keeps the root reading when both folders hold the file', () => {
    touch('vite.config.ts');
    expect(anchorTriggerGlob('vite.config.ts', root, web)).toBe('vite.config.ts');
  });

  it('keeps a glob whose literal folder exists from the root', () => {
    touch('src/index.ts');
    expect(anchorTriggerGlob('src/**/*.ts', root, web)).toBe('src/**/*.ts');
  });
});

describe('anchorTriggerGlob — a path that exists nowhere is a file about to be created', () => {
  it('moves it onto the current folder', () => {
    expect(anchorTriggerGlob('vitest.config.ts', root, web)).toBe('packages/web/vitest.config.ts');
    expect(anchorTriggerGlob('later/new.ts', root, web)).toBe('packages/web/later/new.ts');
  });

  it('keeps it when only the root-side parent folder exists', () => {
    mkdirSync(join(root, 'docs'));
    expect(anchorTriggerGlob('docs/new.md', root, web)).toBe('docs/new.md');
  });
});

describe('anchorTriggerGlob — globs it never moves', () => {
  it.each(['**/*.ts', '*.ts', '{src,lib}/*.ts', '**', '!**/*.md'])('keeps %j', (glob) => {
    expect(anchorTriggerGlob(glob, root, web)).toBe(glob);
  });

  it('keeps an absolute glob (the project-relative step handles it)', () => {
    const abs = join(web, 'vite.config.ts').replaceAll('\\', '/');
    expect(anchorTriggerGlob(abs, root, web)).toBe(abs);
  });

  it.each(['src/', 'src//app.ts', ''])('keeps the odd shape %j', (glob) => {
    expect(anchorTriggerGlob(glob, root, web)).toBe(glob);
  });

  it('keeps a path that would leave the project', () => {
    expect(anchorTriggerGlob('../../../x.ts', root, web)).toBe('../../../x.ts');
  });

  it('does not move anything when the folder is the root or outside it', () => {
    expect(anchorTriggerGlob('vite.config.ts', root, root)).toBe('vite.config.ts');
    expect(anchorTriggerGlob('vite.config.ts', root, tmpdir())).toBe('vite.config.ts');
  });
});
