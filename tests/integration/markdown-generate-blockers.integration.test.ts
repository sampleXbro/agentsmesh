/**
 * A rule may document link syntax, cite a footnote, or link a URL with
 * parentheses in it. Each of those used to fail `agentsmesh generate` outright
 * or corrupt the URL on the way out.
 */

import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerate } from '../../src/cli/commands/generate.js';

const PAREN_URL = 'https://github.com/org/repo/blob/main/apps/(marketing)/package.json';

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'am-md-blockers-'));
  await mkdir(join(project, '.agentsmesh/rules'), { recursive: true });
  await writeFile(
    join(project, 'agentsmesh.yaml'),
    JSON.stringify({ version: 1, targets: ['claude-code'], features: ['rules'] }),
  );
  await writeFile(join(project, '.agentsmesh/rules/_root.md'), '---\nroot: true\n---\nRoot.\n');
  // A real `package.json` in the project is what made the URL's tail look like
  // a local path worth rewriting, which is how the URL got corrupted.
  await writeFile(join(project, 'package.json'), '{}\n');
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

it('generates a rule that documents link syntax inside inline code', async () => {
  await writeFile(
    join(project, '.agentsmesh/rules/style.md'),
    '---\ndescription: Style\n---\nWrite links like `[label](path/to/file.md)` so they rebase.\n',
  );

  const result = await runGenerate({}, project, { printMatrix: false });

  expect(result.exitCode).toBe(0);
  const out = await readFile(join(project, '.claude/rules/style.md'), 'utf8');
  expect(out).toContain('`[label](path/to/file.md)`');
});

it('generates a rule that carries a GFM footnote definition', async () => {
  await writeFile(
    join(project, '.agentsmesh/rules/notes.md'),
    '---\ndescription: Notes\n---\nPrefer small commits.[^1]\n\n[^1]: See the design notes.\n',
  );

  const result = await runGenerate({}, project, { printMatrix: false });

  expect(result.exitCode).toBe(0);
  const out = await readFile(join(project, '.claude/rules/notes.md'), 'utf8');
  expect(out).toContain('[^1]: See the design notes.');
});

it('keeps a URL whose path contains parentheses intact', async () => {
  await writeFile(
    join(project, '.agentsmesh/rules/urls.md'),
    `---\ndescription: Urls\n---\nThe manifest lives at ${PAREN_URL} today.\n\n[pkg](${PAREN_URL})\n`,
  );

  const result = await runGenerate({}, project, { printMatrix: false });

  expect(result.exitCode).toBe(0);
  const out = await readFile(join(project, '.claude/rules/urls.md'), 'utf8');
  expect(out).toContain(`at ${PAREN_URL} today`);
  expect(out).toContain(`[pkg](${PAREN_URL})`);
});
