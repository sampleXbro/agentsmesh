/**
 * Root-rule frontmatter branches in src/targets/junie/importer.ts:
 * string `description` / array `globs` are read from the Junie root file and
 * handed to the canonical serializer (which drops globs for root rules).
 */
import { AB_ROOT_RULE } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFrontmatter } from '../../../../src/utils/text/markdown.js';
import { importFromJunie } from '../../../../src/targets/junie/importer.js';
import { JUNIE_TARGET, JUNIE_DOT_AGENTS } from '../../../../src/targets/junie/constants.js';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'am-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

async function writeRoot(content: string): Promise<string> {
  const srcPath = join(projectRoot, JUNIE_DOT_AGENTS);
  await mkdir(dirname(srcPath), { recursive: true });
  await writeFile(srcPath, content);
  return srcPath;
}

async function readCanonicalRoot(): Promise<{
  frontmatter: Record<string, unknown>;
  body: string;
}> {
  return parseFrontmatter(await readFile(join(projectRoot, AB_ROOT_RULE), 'utf-8'));
}

describe('importFromJunie — root rule frontmatter', () => {
  it('keeps a string description and reads array globs (dropped on the root rule)', async () => {
    const srcPath = await writeRoot(
      '---\ndescription: Root rule\nglobs:\n  - "src/**"\n---\n\n# Root\n\nKeep it simple.\n',
    );

    const results = await importFromJunie(projectRoot);

    expect(results).toEqual([
      {
        fromTool: JUNIE_TARGET,
        fromPath: srcPath,
        toPath: AB_ROOT_RULE,
        feature: 'rules',
      },
    ]);
    const { frontmatter, body } = await readCanonicalRoot();
    expect(frontmatter).toEqual({ root: true, description: 'Root rule' });
    expect(body).toContain('Keep it simple.');
  });

  it('ignores a non-string description and non-array globs', async () => {
    await writeRoot('---\ndescription: 42\nglobs: "src/**"\n---\n\nBody only.\n');

    const results = await importFromJunie(projectRoot);

    expect(results).toHaveLength(1);
    const { frontmatter, body } = await readCanonicalRoot();
    expect(frontmatter).toEqual({ root: true, description: '' });
    expect(body).toContain('Body only.');
  });
});
