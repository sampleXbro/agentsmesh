import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emitCopiedFiles, FILES_TARGET_ID } from '../../../../../src/canonical/features/files/emit.js';

const ROOT = join(tmpdir(), `agentsmesh-files-emit-${process.pid}`);

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
});
afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

describe('emitCopiedFiles', () => {
  it('emits created status for missing files with target files', async () => {
    const results = await emitCopiedFiles([{ path: '.gitignore', content: 'dist\n' }], ROOT);
    expect(results).toEqual([
      {
        target: FILES_TARGET_ID,
        path: '.gitignore',
        content: 'dist\n',
        currentContent: undefined,
        status: 'created',
      },
    ]);
  });

  it('reports unchanged when on-disk bytes already match', async () => {
    writeFileSync(join(ROOT, '.gitignore'), 'dist\n');
    const results = await emitCopiedFiles([{ path: '.gitignore', content: 'dist\n' }], ROOT);
    expect(results[0]?.status).toBe('unchanged');
  });

  it('normalizes CRLF text the same way writeFileAtomic will', async () => {
    const results = await emitCopiedFiles(
      [{ path: 'mise.toml', content: 'x = 1\r\n' }],
      ROOT,
    );
    expect(results[0]?.content).toBe('x = 1\n');
  });
});
