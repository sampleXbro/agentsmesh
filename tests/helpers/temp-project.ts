/**
 * A fresh project folder per test, removed afterwards. `root()` is its real
 * path (macOS tmp is a /private symlink), and `write`/`read` take paths
 * relative to it. Call at module level, before any hook that uses it.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

export interface TempProject {
  readonly root: () => string;
  readonly write: (rel: string, text: string) => void;
  readonly read: (rel: string) => string;
}

export function useTempProject(prefix: string): TempProject {
  let root = '';
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  return {
    root: () => root,
    write: (rel, text) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    },
    read: (rel) => readFileSync(join(root, rel), 'utf8'),
  };
}
