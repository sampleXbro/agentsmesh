import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, symlinkSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseCopiedFiles } from './load.js';

const ROOT = join(tmpdir(), `agentsmesh-files-load-${process.pid}`);

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
});
afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

describe('parseCopiedFiles', () => {
  it('loads nested files with POSIX relative paths', async () => {
    mkdirSync(join(ROOT, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(ROOT, '.gitignore'), 'node_modules\n');
    writeFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
    const files = await parseCopiedFiles(ROOT);
    expect(files.map((f) => f.path)).toEqual(['.github/workflows/ci.yml', '.gitignore']);
    expect(files.find((f) => f.path === '.gitignore')?.content).toBe('node_modules\n');
  });

  it('skips symlinks', async () => {
    writeFileSync(join(ROOT, 'real.txt'), 'ok\n');
    symlinkSync(join(ROOT, 'real.txt'), join(ROOT, 'link.txt'));
    const files = await parseCopiedFiles(ROOT);
    expect(files.map((f) => f.path)).toEqual(['real.txt']);
  });

  it('records owner-executable mode as 0o755', async () => {
    const script = join(ROOT, 'tool.sh');
    writeFileSync(script, '#!/bin/sh\n');
    chmodSync(script, 0o755);
    const files = await parseCopiedFiles(ROOT);
    expect(files[0]?.mode).toBe(0o755);
  });

  it('rejects reserved paths under the files tree', async () => {
    mkdirSync(join(ROOT, '.agentsmesh'), { recursive: true });
    writeFileSync(join(ROOT, '.agentsmesh', 'x'), 'nope\n');
    await expect(parseCopiedFiles(ROOT)).rejects.toThrow(/reserved/);
  });

  it('returns empty when the directory is missing', async () => {
    expect(await parseCopiedFiles(join(ROOT, 'missing'))).toEqual([]);
  });
});
