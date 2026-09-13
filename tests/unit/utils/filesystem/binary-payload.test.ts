import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSafe, writeFileAtomic } from '../../../../src/utils/filesystem/fs.js';
import { buildOutputChecksums } from '../../../../src/config/core/lock-outputs.js';
import { hashFileForManifest } from '../../../../src/utils/crypto/hash.js';

/** A PNG header plus bytes that are invalid UTF-8 on purpose. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0xff, 0xfe, 0x80, 0x81, 0x0d, 0x0a, 0xc3, 0x28, 0xa0, 0xa1,
]);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'am-binary-payload-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('binary payloads survive the read/write pipeline', () => {
  it('round-trips a PNG byte-for-byte through readFileSafe and writeFileAtomic', async () => {
    const source = join(dir, 'logo.png');
    const dest = join(dir, 'copy.png');
    await writeFile(source, PNG_BYTES);

    const content = await readFileSafe(source);
    expect(content).not.toBeNull();
    await writeFileAtomic(dest, content as string);

    expect(await readFile(dest)).toEqual(PNG_BYTES);
  });

  it('does not fold CRLF or strip a BOM-like prefix inside binary content', async () => {
    const source = join(dir, 'asset.woff2');
    const dest = join(dir, 'out.woff2');
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x00, 0x0d, 0x0a, 0x0d, 0xff]);
    await writeFile(source, bytes);

    await writeFileAtomic(dest, (await readFileSafe(source)) as string);

    expect(await readFile(dest)).toEqual(bytes);
  });

  it('locks a checksum for binary output that matches the file on disk', async () => {
    const rel = 'skills/demo/logo.png';
    const abs = join(dir, rel);
    const content = await (async () => {
      const src = join(dir, 'src.png');
      await writeFile(src, PNG_BYTES);
      return (await readFileSafe(src)) as string;
    })();
    await writeFileAtomic(abs, content);

    const locked = buildOutputChecksums([
      { target: 'claude-code', path: rel, content, status: 'created' },
    ]);
    const onDisk = await hashFileForManifest(abs);

    expect(onDisk).not.toBeNull();
    expect(locked[rel]).toBe(`sha256:${onDisk as string}`);
  });

  it('still normalizes line endings for text payloads', async () => {
    const path = join(dir, 'notes.md');
    await writeFileAtomic(path, 'a\r\nb\r\n');
    expect(await readFile(path, 'utf8')).toBe('a\nb\n');
  });

  it('keeps UTF-8 text readable as text', async () => {
    const path = join(dir, 'rule.md');
    await writeFileAtomic(path, '# Ünïcødé ✅\n');
    expect(await readFileSafe(path)).toBe('# Ünïcødé ✅\n');
  });
});
