/**
 * `--trigger-file` is stored in one canonical, project-relative form, so the
 * same file never gets two trigger nodes and a trigger that can never fire is
 * refused up front: `./src/a.ts` and ` src/a.ts` are `src/a.ts`; `../x.ts`
 * points outside the project; a folder never matches a file; the project root
 * is not a file; and an unsafe glob is refused before any trigger id exists.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeTriggers } from '../../../src/lessons/add-helpers.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { TriggerFileGlobError } from '../../../src/lessons/trigger-file-glob.js';

let root: string;
const emptyGraph = (): LessonsGraph => ({ version: 2, lessons: {}, topics: {}, triggers: {} });
const store = (files: string[], graph = emptyGraph()): string[] => {
  mergeTriggers(graph, { files }, root);
  return Object.values(graph.triggers).map((t) => t.pattern);
};
const rejection = (file: string, projectRoot = root): TriggerFileGlobError => {
  try {
    mergeTriggers(emptyGraph(), { files: [file] }, projectRoot);
  } catch (err) {
    if (err instanceof TriggerFileGlobError) return err;
    throw err;
  }
  throw new Error(`expected ${file} to be rejected`);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-trigger-norm-')).replaceAll('\\', '/');
  mkdirSync(join(root, 'src', 'cli'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('mergeTriggers — one canonical form per file glob', () => {
  it.each([
    ['./src/cli/foo.ts', 'src/cli/foo.ts'],
    ['././src/a.ts', 'src/a.ts'],
    [' src/a.ts ', 'src/a.ts'],
    ['src/./a.ts', 'src/a.ts'],
    ['src/../src/a.ts', 'src/a.ts'],
    ['src//a.ts', 'src/a.ts'],
    ['./src/**/*.ts', 'src/**/*.ts'],
  ])('stores %j as %j', (given, stored) => {
    expect(store([given])).toEqual([stored]);
  });

  it('reuses the existing node for ./src/cli/foo.ts', () => {
    const graph = emptyGraph();
    const first = mergeTriggers(graph, { files: ['src/cli/foo.ts'] }, root);
    const second = mergeTriggers(graph, { files: ['./src/cli/foo.ts'] }, root);
    expect(second).toEqual({ triggerIds: first.triggerIds, newTriggerIds: [] });
  });

  it('accepts a folder that does not exist yet (it may be created later)', () => {
    expect(store(['src/new-dir'])).toEqual(['src/new-dir']);
  });
});

describe('mergeTriggers — refused file globs', () => {
  it.each(['../x.ts', 'src/../../x.ts', '..'])('%j points outside the project', (file) => {
    const err = rejection(file);
    expect(err.code).toBe('TRIGGER_FILE_OUTSIDE_PROJECT');
    expect(err.message).toBe(
      `--trigger-file ${JSON.stringify(file)} points outside the project root. File triggers ` +
        'match project-relative paths, so it would never fire — pass a glob relative to the ' +
        'project root (e.g. "src/**/*.ts").',
    );
  });

  it('an absolute path outside the project gets the same message', () => {
    expect(rejection('/elsewhere/x.ts').message).toMatch(
      /^--trigger-file "\/elsewhere\/x\.ts" points outside the project root\./,
    );
  });

  it.each(['src/cli', 'src/cli/', './src/cli'])('%j is an existing folder', (file) => {
    const err = rejection(file);
    expect(err.code).toBe('TRIGGER_FILE_IS_DIRECTORY');
    expect(err.message).toBe(
      `--trigger-file ${JSON.stringify(file)} is a folder, and file triggers match files. ` +
        'Use "src/cli/**" to match every file in it.',
    );
  });

  it.each(['.', './', '<root>'])('%j is the project root itself', (file) => {
    const given = file === '<root>' ? root : file;
    const err = rejection(given);
    expect(err.code).toBe('TRIGGER_FILE_IS_PROJECT_ROOT');
    expect(err.message).toBe(
      `--trigger-file ${JSON.stringify(given)} is the project root itself, and file triggers ` +
        'match files. Pass a glob such as "src/**/*.ts".',
    );
  });

  it('names the project root reached through a symlink (macOS /tmp is one)', () => {
    const link = join(tmpdir(), `am-trigger-link-${process.pid}`);
    symlinkSync(root, link, 'junction');
    try {
      expect(rejection(link, realpathSync(root)).code).toBe('TRIGGER_FILE_IS_PROJECT_ROOT');
    } finally {
      rmSync(link, { force: true });
    }
  });

  it('refuses an unsafe glob before any trigger node exists', () => {
    const graph = emptyGraph();
    expect(() => mergeTriggers(graph, { files: ['src/+(a|b).ts'] }, root)).toThrow(
      TriggerFileGlobError,
    );
    const err = rejection('src/+(a|b).ts');
    expect(err.code).toBe('UNSAFE_GLOB_PATTERN');
    expect(err.message).toBe(
      '--trigger-file "src/+(a|b).ts" is outside the safe glob subset: extglobs and (…)/| ' +
        'groups are not supported (use {a,b}). Use only *, **, ?, [...] and {a,b}.',
    );
    expect(graph.triggers).toEqual({});
  });
});
