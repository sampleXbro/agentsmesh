import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordMergedFiles } from '../../../../src/install/manifest/record-merged-files.js';
import { hashPackFiles } from '../../../../src/install/manifest/install-manifest-hash.js';

const MANIFEST = '.agentsmesh-install-manifest.json';

let packDir = '';

function write(rel: string, content: string): string {
  const path = join(packDir, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

beforeEach(() => {
  packDir = mkdtempSync(join(tmpdir(), 'record-merged-files-'));
});

afterEach(() => {
  rmSync(packDir, { recursive: true, force: true });
});

describe('recordMergedFiles', () => {
  it('sets the hashes of the written files only, sorted, and keeps the other fields', async () => {
    write('rules/a.md', '# user edit\n');
    const b = write('rules/b.md', '# b\n');
    const ignore = write('ignore', 'secret\n');
    write(
      MANIFEST,
      '{"name":"p","extends_id":null,"files":{"rules/a.md":"sha256:old","gone.md":"sha256:x"}}\n',
    );

    await recordMergedFiles(packDir, [b, ignore]);

    const current = await hashPackFiles(packDir);
    const raw = readFileSync(join(packDir, MANIFEST), 'utf8');
    expect(raw).toBe(
      `${JSON.stringify(
        {
          name: 'p',
          extends_id: null,
          files: {
            'gone.md': 'sha256:x',
            ignore: current['ignore'],
            'rules/a.md': 'sha256:old',
            'rules/b.md': current['rules/b.md'],
          },
        },
        null,
        2,
      )}\n`,
    );
  });

  it('does not record a written path that is not a hashed pack file', async () => {
    write(MANIFEST, '{"files":{}}\n');

    await recordMergedFiles(packDir, [join(packDir, 'missing.md'), join(packDir, 'pack.yaml')]);

    expect(JSON.parse(readFileSync(join(packDir, MANIFEST), 'utf8'))).toEqual({ files: {} });
  });

  it('does not create a manifest for a legacy pack without one', async () => {
    const b = write('rules/b.md', '# b\n');

    await recordMergedFiles(packDir, [b]);

    expect(existsSync(join(packDir, MANIFEST))).toBe(false);
  });

  it.each([
    ['not JSON', 'not json'],
    ['a JSON array', '[]\n'],
    ['null', 'null\n'],
    ['an object without files', '{"name":"p"}\n'],
    ['an object whose files is an array', '{"files":[]}\n'],
  ])('leaves a manifest that is %s as it is', async (_label, content) => {
    const b = write('rules/b.md', '# b\n');
    write(MANIFEST, content);

    await recordMergedFiles(packDir, [b]);

    expect(readFileSync(join(packDir, MANIFEST), 'utf8')).toBe(content);
  });
});
