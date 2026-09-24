/**
 * git keeps symlinks, so a cloned repo can point `.agentsmesh/packs`, or one
 * pack folder, outside the project. install (fresh, replace, merge, --sync,
 * --dry-run) and uninstall refuse such a pack path instead of writing,
 * replacing or deleting outside the project (GHSA-87c3-4xm5-xvpm).
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInstall } from '../../../src/install/run/run-install.js';
import { runUninstall } from '../../../src/install/uninstall/run-uninstall.js';

const UNSAFE = /Unsafe filesystem path/;

let base: string;
let proj: string;
let src: string;
let outside: string;

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
// 'junction' makes directory links work on Windows without admin rights.
const link = (target: string, path: string): void => symlinkSync(target, path, 'junction');
const packs = (): string => join(proj, '.agentsmesh', 'packs');
const install = (flags: Record<string, string | boolean> = {}): ReturnType<typeof runInstall> =>
  runInstall({ force: true, ...flags }, [src], proj);
const uninstall = (
  name: string,
  flags: Record<string, boolean> = {},
): ReturnType<typeof runUninstall> =>
  runUninstall({ force: true, ...flags }, [name], proj, { assumeTty: false });

/** Every file under `dir` with its content, so a test can prove nothing changed. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    files[relative(dir, abs).replaceAll('\\', '/')] = readFileSync(abs, 'utf8');
  }
  return files;
}

/** Install `src` normally, then move its pack folder outside and link it back. */
async function packLinkedOutside(): Promise<string> {
  await install();
  const [name] = readdirSync(packs()).filter((n) => !n.startsWith('.'));
  renameSync(join(packs(), name!), join(outside, name!));
  link(join(outside, name!), join(packs(), name!));
  return name!;
}

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-pack-contain-')));
  proj = join(base, 'proj');
  src = join(base, 'src');
  outside = join(base, 'outside');
  write(join(proj, 'agentsmesh.yaml'), 'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n');
  write(join(proj, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
  write(join(src, '.agentsmesh', 'rules', 'alpha.md'), '---\ndescription: a\n---\n# Alpha\n');
  write(join(src, '.agentsmesh', 'rules', 'beta.md'), '---\ndescription: b\n---\n# Beta\n');
  write(join(outside, 'victim', '.claude', 'settings.json'), '{"user":"keep me"}\n');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('install with .agentsmesh/packs linked outside the project', () => {
  it('refuses and leaves the linked folder alone', async () => {
    link(join(outside, 'victim'), packs());
    const before = snapshot(outside);

    await expect(install({ name: '.claude' })).rejects.toThrow(UNSAFE);

    expect(snapshot(outside)).toEqual(before);
  });

  it('refuses under --dry-run too, so a preview never approves it', async () => {
    link(join(outside, 'victim'), packs());

    await expect(install({ name: '.claude', 'dry-run': true })).rejects.toThrow(UNSAFE);
  });

  it('refuses install --sync of a pack recorded in installs.yaml', async () => {
    await install();
    rmSync(packs(), { recursive: true });
    link(join(outside, 'victim'), packs());
    const before = snapshot(outside);

    await expect(runInstall({ sync: true, force: true }, [], proj)).rejects.toThrow(UNSAFE);

    expect(snapshot(outside)).toEqual(before);
  });
});

describe('install into a pack folder that is a link outside the project', () => {
  it('refuses to replace it on a whole-source re-install', async () => {
    await packLinkedOutside();
    const before = snapshot(outside);

    await expect(install()).rejects.toThrow(UNSAFE);

    expect(snapshot(outside)).toEqual(before);
  });

  it('refuses to merge a picked rule into it', async () => {
    await install({ path: '.agentsmesh/rules/alpha.md' });
    const [name] = readdirSync(packs()).filter((n) => !n.startsWith('.'));
    renameSync(join(packs(), name!), join(outside, name!));
    link(join(outside, name!), join(packs(), name!));
    const before = snapshot(outside);

    await expect(install({ path: '.agentsmesh/rules/beta.md' })).rejects.toThrow(UNSAFE);

    expect(snapshot(outside)).toEqual(before);
  });
});

describe('uninstall of a pack that resolves outside the project', () => {
  it('refuses when .agentsmesh/packs is linked outside, and deletes nothing there', async () => {
    await install();
    const [name] = readdirSync(packs()).filter((n) => !n.startsWith('.'));
    renameSync(packs(), join(outside, 'packs'));
    link(join(outside, 'packs'), packs());
    const before = snapshot(outside);

    await expect(uninstall(name!)).rejects.toThrow(UNSAFE);
    await expect(uninstall(name!, { 'dry-run': true })).rejects.toThrow(UNSAFE);

    expect(snapshot(outside)).toEqual(before);
  });

  it('refuses when the pack folder itself is a link outside', async () => {
    const name = await packLinkedOutside();
    const before = snapshot(outside);

    await expect(uninstall(name)).rejects.toThrow(UNSAFE);

    expect(snapshot(outside)).toEqual(before);
  });
});
