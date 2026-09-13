import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CanonicalFiles } from '../../../src/core/types.js';
import { materializePack } from '../../../src/install/pack/pack-writer.js';

const canonical: CanonicalFiles = {
  rules: [],
  commands: [],
  agents: [],
  skills: [],
  mcp: null,
  permissions: null,
  hooks: null,
  ignore: [],
};

let packsDir: string;

beforeEach(async () => {
  packsDir = await mkdtemp(join(tmpdir(), 'pack-sibling-safety-'));
});

afterEach(async () => {
  await rm(packsDir, { recursive: true, force: true });
});

function install(name: string): ReturnType<typeof materializePack> {
  return materializePack(packsDir, name, canonical, {
    name,
    source: `/source/${name}`,
    source_kind: 'local',
    installed_at: '2026-09-07T00:00:00Z',
    updated_at: '2026-09-07T00:00:00Z',
    features: ['rules'],
  });
}

describe('pack staging ownership', () => {
  it.each([false, true])(
    'preserves legal sibling pack names when replacing=%s',
    async (replace) => {
      for (const name of ['pack.old', 'pack.tmp']) {
        await install(name);
        await writeFile(join(packsDir, name, 'local-edit.txt'), `${name} user changes`);
      }
      if (replace) await install('pack');
      await install('pack');

      expect((await readdir(packsDir)).sort()).toEqual(['pack', 'pack.old', 'pack.tmp']);
      for (const name of ['pack.old', 'pack.tmp']) {
        expect(await readFile(join(packsDir, name, 'local-edit.txt'), 'utf8')).toBe(
          `${name} user changes`,
        );
        expect((await readdir(join(packsDir, name))).sort()).toEqual([
          '.agentsmesh-install-manifest.json',
          'local-edit.txt',
          'pack.yaml',
        ]);
      }
    },
  );

  it('preserves sibling contents and removes its own staging after a write failure', async () => {
    await install('pack.tmp');
    await writeFile(join(packsDir, 'pack.tmp', 'local-edit.txt'), 'user changes');
    const metadata = await install('pack');
    const previousManifest = await readFile(join(packsDir, 'pack', 'pack.yaml'), 'utf8');

    await expect(
      materializePack(
        packsDir,
        'pack',
        {
          ...canonical,
          rules: [
            {
              source: join(packsDir, 'missing.md'),
              root: false,
              targets: [],
              description: '',
              globs: [],
              body: '',
            },
          ],
        },
        metadata,
      ),
    ).rejects.toThrow(/ENOENT/);

    expect((await readdir(packsDir)).sort()).toEqual(['pack', 'pack.tmp']);
    expect(await readFile(join(packsDir, 'pack.tmp', 'local-edit.txt'), 'utf8')).toBe(
      'user changes',
    );
    expect(await readFile(join(packsDir, 'pack', 'pack.yaml'), 'utf8')).toBe(previousManifest);
  });
});
