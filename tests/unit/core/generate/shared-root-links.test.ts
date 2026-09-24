/**
 * When two targets write the same root file (AGENTS.md), its copies keep
 * canonical references so they merge. A relative link in the root rule must
 * still be rebased to the canonical file it names, or the shared file links to
 * nothing and generate fails (#139).
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-shared-root-links-')));
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(root, '.agentsmesh', 'rules', '_root.md'),
    '---\nroot: true\n---\n# Root\nSee [TS rule](./typescript.md).\n',
  );
  writeFileSync(
    join(root, '.agentsmesh', 'rules', 'typescript.md'),
    '---\ndescription: ts\nglobs: ["src/**/*.ts"]\n---\n# TS\n',
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('a relative link in a root rule shared by two AGENTS.md targets', () => {
  it.each([
    ['codex-cli', 'cursor'],
    ['codex-cli', 'gemini-cli'],
    ['cursor', 'windsurf'],
  ])('%s + %s: generate succeeds and the link points to the canonical rule', async (a, b) => {
    writeFileSync(
      join(root, 'agentsmesh.yaml'),
      `version: 1\ntargets: [${a}, ${b}]\nfeatures: [rules]\n`,
    );

    const { exitCode } = await runGenerate({}, root, { printMatrix: false });

    const link = /\[TS rule\]\(([^)]+)\)/.exec(readFileSync(join(root, 'AGENTS.md'), 'utf8'))?.[1];
    expect([exitCode, link]).toEqual([0, '.agentsmesh/rules/typescript.md']);
    expect(existsSync(join(root, link ?? ''))).toBe(true);
  });

  it('rebases only link destinations: backticked and prose paths stay as written', async () => {
    writeFileSync(
      join(root, 'agentsmesh.yaml'),
      'version: 1\ntargets: [codex-cli, cursor]\nfeatures: [rules]\n',
    );
    mkdirSync(join(root, '.agentsmesh', 'skills', 'qa'), { recursive: true });
    writeFileSync(
      join(root, '.agentsmesh', 'skills', 'qa', 'SKILL.md'),
      '---\ndescription: qa\n---\n# QA\n',
    );
    writeFileSync(
      join(root, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\n# Root\nSee [TS rule](./typescript.md) and [ts].\n' +
        'Use the skill (`.agentsmesh/skills/qa/`) and read `.agentsmesh/rules/typescript.md`.\n\n' +
        '[ts]: ./typescript.md\n',
    );

    await runGenerate({}, root, { printMatrix: false });

    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain(
      '# Root\nSee [TS rule](.agentsmesh/rules/typescript.md) and [ts].\n' +
        'Use the skill (`.agentsmesh/skills/qa/`) and read `.agentsmesh/rules/typescript.md`.\n\n' +
        '[ts]: .agentsmesh/rules/typescript.md',
    );
  });
});
