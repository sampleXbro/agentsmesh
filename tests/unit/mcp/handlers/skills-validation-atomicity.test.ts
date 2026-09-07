import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpContext } from '../../../../src/mcp/context.js';
import { skillsHandlers } from '../../../../src/mcp/handlers/skills.js';

let root: string;
let ctx: McpContext;
let skillDir: string;
const original = '---\nname: demo\ndescription: Original\n---\nOriginal body\n';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-skill-validation-'));
  skillDir = join(root, '.agentsmesh/skills/demo');
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), original);
  ctx = {
    projectRoot: root,
    loadCanonical: async () => {
      throw new Error('unused');
    },
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('skill mutation preflight', () => {
  it('keeps all original files when a supporting body exceeds the size limit', async () => {
    await expect(
      skillsHandlers.update(ctx, {
        name: 'demo',
        body: 'New body',
        supportingFiles: { 'valid.txt': 'valid', 'huge.txt': 'x'.repeat(1048577) },
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(await readFile(join(skillDir, 'SKILL.md'), 'utf8')).toBe(original);
    expect(await readdir(skillDir)).toEqual(['SKILL.md']);
  });

  it('does not create a partial skill when a supporting body is invalid', async () => {
    await expect(
      skillsHandlers.create(ctx, {
        name: 'new',
        frontmatter: {},
        body: 'New body',
        supportingFiles: { 'huge.txt': 'x'.repeat(1048577) },
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(await readdir(join(root, '.agentsmesh/skills'))).toEqual(['demo']);
  });

  it.each(['SKILL.md', 'skill.md'])('rejects deleting the primary file via %s', async (path) => {
    await expect(
      skillsHandlers.update(ctx, {
        name: 'demo',
        body: 'New body',
        supportingFiles: { [path]: null },
      }),
    ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
    expect(await readFile(join(skillDir, 'SKILL.md'), 'utf8')).toBe(original);
  });

  it('rejects replacing the primary file through supportingFiles during create', async () => {
    await expect(
      skillsHandlers.create(ctx, {
        name: 'new',
        frontmatter: {},
        body: 'New body',
        supportingFiles: { 'SKILL.md': 'bypass frontmatter validation' },
      }),
    ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
    expect(await readdir(join(root, '.agentsmesh/skills'))).toEqual(['demo']);
  });

  it.skipIf(process.platform === 'win32')(
    'checks every supporting destination before changing the body',
    async () => {
      const outside = await mkdtemp(join(tmpdir(), 'am-skill-outside-'));
      try {
        await symlink(outside, join(skillDir, 'external'));
        await expect(
          skillsHandlers.update(ctx, {
            name: 'demo',
            body: 'New body',
            supportingFiles: { 'external/file.txt': 'new' },
          }),
        ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
        expect(await readFile(join(skillDir, 'SKILL.md'), 'utf8')).toBe(original);
        expect(await readdir(outside)).toEqual([]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    },
  );
});
