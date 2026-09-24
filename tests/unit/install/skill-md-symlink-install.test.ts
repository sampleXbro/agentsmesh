/**
 * A symlinked SKILL.md must never bring an outside file into the project:
 * not from an install source (a skills collection or a root SKILL.md) and not
 * from the project's own canonical skills during generate (GHSA-pxf6-493h-83j5).
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGenerate } from '../../../src/cli/commands/generate.js';
import { runInstall } from '../../../src/install/run/run-install.js';

const CANARY = 'CANARY_SECRET_4821';

let base: string;
let proj: string;

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

/** Project files that contain the canary, forward-slashed and sorted. */
function leaks(): string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(proj, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    if (readFileSync(abs, 'utf8').includes(CANARY))
      hits.push(relative(proj, abs).replaceAll('\\', '/'));
  }
  return hits.sort();
}

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-skill-leak-')));
  proj = join(base, 'proj');
  write(join(base, 'creds.txt'), `---\nname: pwn\ndescription: d\n---\n${CANARY}\n`);
  write(
    join(proj, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code, cursor]\nfeatures: [rules, skills]\n',
  );
  write(join(proj, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

// File symlinks need extra rights on Windows, so these run on POSIX only.
describe.skipIf(process.platform === 'win32')('a symlinked SKILL.md', () => {
  it('in a skills collection source is not installed; the other skills are', async () => {
    const src = join(base, 'evilrepo');
    write(join(src, 'skills', 'good', 'SKILL.md'), '---\ndescription: fine\n---\n# Good\n');
    mkdirSync(join(src, 'skills', 'pwn'), { recursive: true });
    symlinkSync(join(base, 'creds.txt'), join(src, 'skills', 'pwn', 'SKILL.md'));

    await runInstall({ force: true }, [src], proj);

    expect(leaks()).toEqual([]);
    expect(readFileSync(join(proj, '.claude', 'skills', 'good', 'SKILL.md'), 'utf8')).toContain(
      '# Good',
    );
  });

  it('at the root of a source is not installed', async () => {
    const src = join(base, 'rootskill');
    mkdirSync(src);
    symlinkSync(join(base, 'creds.txt'), join(src, 'SKILL.md'));

    await runInstall({ force: true }, [src], proj).catch(() => undefined);

    expect(leaks()).toEqual([]);
  });

  it("in the project's own canonical skills is not generated", async () => {
    mkdirSync(join(proj, '.agentsmesh', 'skills', 'pwn'), { recursive: true });
    symlinkSync(join(base, 'creds.txt'), join(proj, '.agentsmesh', 'skills', 'pwn', 'SKILL.md'));

    await runGenerate({}, proj, { printMatrix: false });

    expect(leaks()).toEqual([]);
  });
});
