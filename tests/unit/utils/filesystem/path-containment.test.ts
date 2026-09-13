import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertPathInsideRoot } from '../../../../src/utils/filesystem/path-containment.js';

const posix = (path: string): string => path.replaceAll('\\', '/');

let sandbox: string;
let root: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'am-containment-'));
  root = join(sandbox, 'root');
  await mkdir(root);
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('assertPathInsideRoot', () => {
  it('accepts a path inside the root even when the leaf does not exist yet', async () => {
    await expect(
      assertPathInsideRoot(root, join(root, 'new', 'child.md')),
    ).resolves.toBeUndefined();
  });

  it('names the boundary when the path is lexically outside the root', async () => {
    const target = join(sandbox, 'elsewhere');
    await expect(assertPathInsideRoot(root, target)).rejects.toThrow(
      `Unsafe filesystem path: ${posix(target)} is outside ${posix(resolve(root))}`,
    );
  });

  it.skipIf(process.platform === 'win32')(
    'names the resolved location when a symlink escapes the root',
    async () => {
      const outside = join(sandbox, 'outside');
      await mkdir(outside);
      await symlink(outside, join(root, 'link'), 'dir');
      const [realOutside, realRoot] = await Promise.all([realpath(outside), realpath(root)]);
      const target = join(root, 'link', 'file.md');

      await expect(assertPathInsideRoot(root, target)).rejects.toThrow(
        `Unsafe filesystem path: ${target} resolves to ${join(realOutside, 'file.md')} outside ${realRoot}`,
      );
    },
  );

  it.skipIf(process.platform === 'win32')('reports a path it cannot resolve', async () => {
    await writeFile(join(root, 'file'), 'x');
    const target = join(root, 'file', 'child');

    await expect(assertPathInsideRoot(root, target)).rejects.toThrow(
      new RegExp(`^Unsafe filesystem path: ${target} could not be resolved \\(ENOTDIR`),
    );
  });
});
