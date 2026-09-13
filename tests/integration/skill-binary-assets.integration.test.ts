import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerate } from '../../src/cli/commands/generate.js';

/** Bytes that are not valid UTF-8, so a lossy decode is detectable. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x80, 0x81, 0xc3, 0x28,
]);

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'am-skill-binary-'));
  const skill = join(project, '.agentsmesh/skills/brand');
  await mkdir(join(skill, 'assets'), { recursive: true });
  await mkdir(join(project, '.agentsmesh/rules'), { recursive: true });
  await writeFile(
    join(project, 'agentsmesh.yaml'),
    JSON.stringify({ version: 1, targets: ['claude-code'], features: ['rules', 'skills'] }),
  );
  await writeFile(join(project, '.agentsmesh/rules/_root.md'), '---\nroot: true\n---\nRoot\n');
  await writeFile(
    join(skill, 'SKILL.md'),
    '---\nname: brand\ndescription: Brand assets\n---\nUse the logo.\n',
  );
  await writeFile(join(skill, 'assets/logo.png'), PNG_BYTES);
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

it('copies a binary skill asset to the target byte-for-byte', async () => {
  const result = await runGenerate({}, project, { printMatrix: false });
  expect(result.exitCode).toBe(0);

  const generated = join(project, '.claude/skills/brand/assets/logo.png');
  expect(await readFile(generated)).toEqual(PNG_BYTES);
});

it('reports no drift right after generating a binary asset', async () => {
  await runGenerate({}, project, { printMatrix: false });
  const check = await runGenerate({ check: true }, project, { printMatrix: false });
  expect(check.exitCode).toBe(0);
});
