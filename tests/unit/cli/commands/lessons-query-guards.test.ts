import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unreadableGraphWarning } from '../../../../src/cli/commands/lessons-query-guards.js';
import { graphFilePath } from '../../../../src/lessons/graph-store.js';

let root: string;
const writeGraph = (text: string): void => {
  mkdirSync(dirname(graphFilePath(root)), { recursive: true });
  writeFileSync(graphFilePath(root), text, 'utf8');
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-query-guards-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('unreadableGraphWarning', () => {
  it('names a merge conflict and points at `lessons resolve`', () => {
    writeGraph('<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> other\n');
    const warning = unreadableGraphWarning(root, new Error('Unexpected token <'));
    expect(warning).toContain('merge conflict');
    expect(warning).toContain('recall returned no lessons');
    expect(warning).toContain('agentsmesh lessons resolve');
    expect(warning).not.toContain('git checkout');
  });

  it('keeps sending a corrupt graph to `lessons validate` with the parse error', () => {
    writeGraph('{ nope');
    expect(unreadableGraphWarning(root, new Error('Bad JSON'))).toBe(
      'lessons.json is unreadable (corrupt) — recall returned no lessons. ' +
        'Run `agentsmesh lessons validate`. (Bad JSON)',
    );
  });
});
