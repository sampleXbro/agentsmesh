/**
 * Codex scopes a rule with a nested `<dir>/AGENTS.md`. Importing that
 * generated file back must restore the canonical rule it came from, not add a
 * `<dir>.md` rule whose text the next generate duplicates (#140). Other tools
 * that read or write the same nested files must understand it too.
 */

import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProject } from '../../../helpers/temp-project.js';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { runImport } from '../../../../src/cli/commands/import.js';

const { root, write, read } = useTempProject('am-codex-nested-');

const rules = (): string[] => readdirSync(join(root(), '.agentsmesh', 'rules')).sort();
const count = (text: string, part: string): number => text.split(part).length - 1;
const generate = (): Promise<unknown> => runGenerate({}, root(), { printMatrix: false });

function project(targets: string, ruleFrontmatter = ''): void {
  write('agentsmesh.yaml', `version: 1\ntargets: [${targets}]\nfeatures: [rules]\n`);
  write('.agentsmesh/rules/_root.md', '---\nroot: true\n---\n# Root\n');
  write(
    '.agentsmesh/rules/typescript.md',
    `---\ndescription: ts\nglobs: ["src/**/*.ts"]\n${ruleFrontmatter}---\n# TS\nSCOPED_TEXT\n`,
  );
}

describe('codex-cli nested AGENTS.md round trip', () => {
  it('is a no-op for rules that came from canonical files', async () => {
    project('codex-cli');
    await generate();
    const canonical = read('.agentsmesh/rules/typescript.md');

    for (let cycle = 0; cycle < 2; cycle++) {
      await runImport({ from: 'codex-cli' }, root());
      await generate();
    }

    expect(rules()).toEqual(['_root.md', 'typescript.md']);
    expect(count(read('src/AGENTS.md'), 'SCOPED_TEXT')).toBe(1);
    expect(read('.agentsmesh/rules/typescript.md')).toContain('SCOPED_TEXT');
    expect(read('.agentsmesh/rules/typescript.md').includes('src/**/*.ts')).toBe(
      canonical.includes('src/**/*.ts'),
    );
  });

  it('restores an override rule, with its variant, into a fresh canonical tree', async () => {
    project('codex-cli', 'codex_instruction: override\n');
    await generate();
    rmSync(join(root(), '.agentsmesh', 'rules', 'typescript.md'));

    await runImport({ from: 'codex-cli' }, root());

    expect(rules()).toEqual(['_root.md', 'typescript.md']);
    expect(read('.agentsmesh/rules/typescript.md')).toContain('codex_instruction: override');
  });

  it('still imports hand-written text in a nested file as the directory rule', async () => {
    project('codex-cli');
    await generate();
    write('src/AGENTS.md', `${read('src/AGENTS.md')}\n\nHAND_WRITTEN\n`);

    await runImport({ from: 'codex-cli' }, root());

    expect(rules()).toEqual(['_root.md', 'src.md', 'typescript.md']);
    expect([
      read('.agentsmesh/rules/src.md').includes('HAND_WRITTEN'),
      read('.agentsmesh/rules/src.md').includes('SCOPED_TEXT'),
    ]).toEqual([true, false]);
  });

  it('works when codebuff writes the same nested file', async () => {
    project('codex-cli, codebuff');
    write(
      '.agentsmesh/rules/buffonly.md',
      '---\ndescription: b\nglobs: ["src/**"]\ntargets: [codebuff]\n---\nBUFF_TEXT\n',
    );
    await generate();

    await runImport({ from: 'codebuff' }, root());
    await generate();

    expect(rules()).toEqual(['_root.md', 'buffonly.md', 'typescript.md']);
    expect([
      count(read('src/AGENTS.md'), 'SCOPED_TEXT'),
      count(read('src/AGENTS.md'), 'BUFF_TEXT'),
    ]).toEqual([1, 1]);
  });

  it('windsurf import restores the rule from a nested file codex wrote', async () => {
    project('codex-cli');
    await generate();
    write('agentsmesh.yaml', 'version: 1\ntargets: [windsurf]\nfeatures: [rules]\n');

    await runImport({ from: 'windsurf' }, root());

    expect(rules()).toEqual(['_root.md', 'typescript.md']);
  });
});
