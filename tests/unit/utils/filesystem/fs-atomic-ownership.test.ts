import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileAtomic } from '../../../../src/utils/filesystem/fs.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
    open: vi.fn(actual.open),
  };
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'am-atomic-owner-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('atomic write temporary file ownership', () => {
  it('preserves an unrelated sibling .tmp file', async () => {
    const path = join(dir, 'settings.json');
    await writeFile(`${path}.tmp`, 'user draft');
    await writeFileAtomic(path, '{}');
    expect(await readFile(`${path}.tmp`, 'utf8')).toBe('user draft');
    expect(await readFile(path, 'utf8')).toBe('{}');
    expect((await readdir(dir)).sort()).toEqual(['settings.json', 'settings.json.tmp']);
  });

  it('preserves an unrelated sibling .tmp directory', async () => {
    const path = join(dir, 'settings.json');
    await mkdir(`${path}.tmp`);
    await writeFile(join(`${path}.tmp`, 'draft'), 'user draft');
    await writeFileAtomic(path, '{}');
    expect(await readFile(join(`${path}.tmp`, 'draft'), 'utf8')).toBe('user draft');
    expect((await readdir(dir)).sort()).toEqual(['settings.json', 'settings.json.tmp']);
  });

  it.skipIf(process.platform === 'win32')(
    'preserves an unrelated sibling .tmp symlink',
    async () => {
      const path = join(dir, 'settings.json');
      await writeFile(join(dir, 'draft'), 'user draft');
      await symlink(join(dir, 'draft'), `${path}.tmp`);
      await writeFileAtomic(path, '{}');
      expect(await readlink(`${path}.tmp`)).toBe(join(dir, 'draft'));
      expect(await readFile(join(dir, 'draft'), 'utf8')).toBe('user draft');
      expect((await readdir(dir)).sort()).toEqual(['draft', 'settings.json', 'settings.json.tmp']);
    },
  );

  it('completes concurrent writes with one intact payload and no temporary files', async () => {
    const path = join(dir, 'settings.json');
    const payloads = Array.from({ length: 16 }, (_, i) => String(i).repeat(100_000));
    const results = await Promise.allSettled(
      payloads.map((payload) => writeFileAtomic(path, payload)),
    );
    expect(results).toEqual(payloads.map(() => ({ status: 'fulfilled', value: undefined })));
    expect(payloads).toContain(await readFile(path, 'utf8'));
    expect(await readdir(dir)).toEqual(['settings.json']);
  });

  it('preserves the old file and removes only its temporary file when rename fails', async () => {
    const path = join(dir, 'settings.json');
    await writeFile(path, 'original');
    await writeFile(`${path}.tmp`, 'user draft');
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error('rename denied'), { code: 'EACCES' }),
    );
    await expect(writeFileAtomic(path, '{}')).rejects.toThrow('rename denied');
    expect(await readFile(path, 'utf8')).toBe('original');
    expect(await readFile(`${path}.tmp`, 'utf8')).toBe('user draft');
    expect((await readdir(dir)).sort()).toEqual(['settings.json', 'settings.json.tmp']);
  });

  it.skipIf(process.platform === 'win32')(
    'preserves the destination symlink when rename fails',
    async () => {
      const path = join(dir, 'settings.json');
      await writeFile(join(dir, 'original'), 'original');
      await symlink(join(dir, 'original'), path);
      vi.mocked(fs.rename).mockRejectedValueOnce(
        Object.assign(new Error('rename denied'), { code: 'EACCES' }),
      );
      await expect(writeFileAtomic(path, '{}')).rejects.toThrow('rename denied');
      expect(await readlink(path)).toBe(join(dir, 'original'));
      expect(await readFile(path, 'utf8')).toBe('original');
      expect((await readdir(dir)).sort()).toEqual(['original', 'settings.json']);
    },
  );
});

describe('cleanup failures never mask the write error', () => {
  it('surfaces the rename error when removing the temporary file also fails', async () => {
    const path = join(dir, 'settings.json');
    await writeFile(path, 'original');
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error('rename denied'), { code: 'EACCES' }),
    );
    vi.mocked(fs.rm).mockRejectedValueOnce(
      Object.assign(new Error('rm denied'), { code: 'EPERM' }),
    );

    await expect(writeFileAtomic(path, '{}')).rejects.toThrow('rename denied');
    expect(await readFile(path, 'utf8')).toBe('original');
    const entries = (await readdir(dir)).sort();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toBe('settings.json');
    expect(entries[1]).toMatch(/^settings\.json\.tmp-[0-9a-f-]{36}$/);
  });

  it('surfaces the write error when closing the temporary file also fails', async () => {
    const path = join(dir, 'settings.json');
    await writeFile(path, 'original');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(fs.open).mockImplementationOnce(async (...args: Parameters<typeof actual.open>) => {
      const real = await actual.open(...args);
      const broken: Pick<FileHandle, 'writeFile' | 'chmod' | 'close'> = {
        writeFile: async () => {
          throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
        },
        chmod: (mode) => real.chmod(mode),
        close: async () => {
          await real.close();
          throw new Error('close failed');
        },
      };
      return broken as unknown as FileHandle;
    });

    await expect(writeFileAtomic(path, '{}')).rejects.toThrow('disk full');
    expect(await readFile(path, 'utf8')).toBe('original');
    expect(await readdir(dir)).toEqual(['settings.json']);
  });
});
