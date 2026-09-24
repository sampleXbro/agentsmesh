/**
 * Windsurf applies a `.windsurf/rules/*.md` rule with `trigger: glob` to the
 * files its globs match, and treats a subdirectory `AGENTS.md` as a rule for
 * that directory (docs.devin.ai/desktop/cascade/memories). A scoped rule is
 * therefore written once, as its own glob rule; the extra `<dir>.md` copy and
 * `<dir>/AGENTS.md` loaded it twice and made import add a `<dir>.md` rule.
 */

import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTempProject } from '../../../helpers/temp-project.js';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { runImport } from '../../../../src/cli/commands/import.js';

const { root, write, read } = useTempProject('am-windsurf-scoped-');

const rules = (): string[] => readdirSync(join(root(), '.agentsmesh', 'rules')).sort();
const generate = (): Promise<unknown> => runGenerate({}, root(), { printMatrix: false });

/**
 * Every generated file outside `.agentsmesh/` and the config, forward-slashed.
 * `.agentsmeshcache` is generate's link to the shared remote cache, not output.
 */
function outputs(): string[] {
  return readdirSync(root(), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root(), join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .filter((path) => !/^(?:\.agentsmesh\/|\.agentsmeshcache\/|agentsmesh)/.test(path))
    .sort();
}

beforeEach(() => {
  write('agentsmesh.yaml', 'version: 1\ntargets: [windsurf]\nfeatures: [rules]\n');
  write('.agentsmesh/rules/_root.md', '---\nroot: true\n---\n# Root\n');
  write(
    '.agentsmesh/rules/typescript.md',
    '---\ndescription: ts\nglobs: ["src/**/*.ts"]\n---\n# TS\nSCOPED_TEXT\n',
  );
});

describe('windsurf scoped rule', () => {
  it('is written once, as its own glob rule', async () => {
    await generate();

    expect(outputs()).toEqual(['.windsurf/rules/typescript.md', 'AGENTS.md']);
  });

  it('round-trips through import without new rules or repeated text', async () => {
    await generate();
    const first = read('.windsurf/rules/typescript.md');

    for (let cycle = 0; cycle < 2; cycle++) {
      await runImport({ from: 'windsurf' }, root());
      await generate();
    }

    expect(rules()).toEqual(['_root.md', 'typescript.md']);
    expect(outputs()).toEqual(['.windsurf/rules/typescript.md', 'AGENTS.md']);
    expect(read('.windsurf/rules/typescript.md')).toBe(first);
  });

  it('does not import a src/AGENTS.md an older version wrote as a new rule', async () => {
    await generate();
    write('src/AGENTS.md', '# TS\nSCOPED_TEXT');

    await runImport({ from: 'windsurf' }, root());

    expect(rules()).toEqual(['_root.md', 'typescript.md']);
  });

  it('matches the old copy against a Windsurf rule file without frontmatter too', async () => {
    await generate();
    write('.windsurf/rules/notes.md', 'PLAIN_NOTE\n');
    write('docs/AGENTS.md', 'PLAIN_NOTE');

    await runImport({ from: 'windsurf' }, root());

    expect(rules()).toEqual(['_root.md', 'notes.md', 'typescript.md']);
  });

  it('still imports a hand-written nested AGENTS.md as the directory rule', async () => {
    await generate();
    write('src/AGENTS.md', '# Src\nHAND_WRITTEN\n');

    await runImport({ from: 'windsurf' }, root());

    expect(rules()).toEqual(['_root.md', 'src.md', 'typescript.md']);
    expect(read('.agentsmesh/rules/src.md')).toContain('HAND_WRITTEN');
  });
});
