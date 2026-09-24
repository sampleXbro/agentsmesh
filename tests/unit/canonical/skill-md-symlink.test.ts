/**
 * A skill whose SKILL.md is a symlink is skipped, like every other canonical
 * entry (readDirRecursiveNoSymlinks, copyDir). Following it copied any local
 * file into packs and generated .claude/.cursor skills (GHSA-pxf6-493h-83j5).
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSkillDirectory, parseSkills } from '../../../src/canonical/features/skills.js';

let base: string;
let skillsDir: string;

const skill = (name: string): string => {
  const dir = join(skillsDir, name);
  mkdirSync(dir, { recursive: true });
  return dir;
};

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-skill-link-')));
  skillsDir = join(base, 'skills');
  writeFileSync(join(base, 'creds.txt'), '---\nname: pwn\n---\nCANARY_SECRET\n');
  writeFileSync(join(skill('ok'), 'SKILL.md'), '---\ndescription: fine\n---\n# OK\n');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

// File symlinks need extra rights on Windows, so these run on POSIX only.
describe.skipIf(process.platform === 'win32')('a symlinked SKILL.md', () => {
  it('is skipped by parseSkills, which keeps the other skills', async () => {
    symlinkSync(join(base, 'creds.txt'), join(skill('pwn'), 'SKILL.md'));

    const skills = await parseSkills(skillsDir);

    expect(skills.map((s) => s.name)).toEqual(['ok']);
  });

  it('is skipped by parseSkillDirectory', async () => {
    symlinkSync(join(base, 'creds.txt'), join(skill('pwn'), 'SKILL.md'));

    expect(await parseSkillDirectory(join(skillsDir, 'pwn'))).toBeNull();
  });

  it('is skipped even when it points inside the same tree', async () => {
    writeFileSync(join(skillsDir, 'shared.md'), '---\ndescription: shared\n---\n# Shared\n');
    symlinkSync(join(skillsDir, 'shared.md'), join(skill('alias'), 'SKILL.md'));

    const skills = await parseSkills(skillsDir);

    expect(skills.map((s) => s.name)).toEqual(['ok']);
  });
});
