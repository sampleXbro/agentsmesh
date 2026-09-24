/**
 * Claude Code scopes a rule with `paths:` (a YAML list or a comma-separated
 * string); it is the only field Claude Code reads from a rule. Import maps it
 * to canonical `globs` and generate writes it back as `paths:`, so a scoped
 * rule never silently becomes global (#137).
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { runImport } from '../../../../src/cli/commands/import.js';
import { generateRules } from '../../../../src/targets/claude-code/generator.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { splitFrontmatter } from '../../../../src/utils/text/markdown.js';

let root: string;

const write = (rel: string, text: string): void => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const frontmatterOf = (rel: string): unknown =>
  parseYaml(splitFrontmatter(readFileSync(join(root, rel), 'utf8'))?.yaml ?? '');

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-claude-paths-')));
  write('CLAUDE.md', '# Root\n');
  write('agentsmesh.yaml', 'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('Claude Code rule paths', () => {
  it('imports a paths list as canonical globs, without an extra paths field', async () => {
    write('.claude/rules/backend.md', '---\npaths:\n  - "src/api/**/*.ts"\n---\n\n# Backend\n');

    await runImport({ from: 'claude-code' }, root);

    expect(frontmatterOf('.agentsmesh/rules/backend.md')).toEqual({
      root: false,
      description: '',
      globs: ['src/api/**/*.ts'],
    });
  });

  it('imports a comma-separated paths string, and an older globs field', async () => {
    write('.claude/rules/a.md', '---\npaths: "src/**/*.ts, test/**/*.ts"\n---\n# A\n');
    write('.claude/rules/b.md', '---\nglobs:\n  - lib/**\n---\n# B\n');

    await runImport({ from: 'claude-code' }, root);

    expect([
      (frontmatterOf('.agentsmesh/rules/a.md') as { globs: string[] }).globs,
      (frontmatterOf('.agentsmesh/rules/b.md') as { globs: string[] }).globs,
    ]).toEqual([['src/**/*.ts', 'test/**/*.ts'], ['lib/**']]);
  });

  it('generates the rule scope as paths', () => {
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: '/p/.agentsmesh/rules/ts.md',
          root: false,
          targets: [],
          description: 'TS',
          globs: ['src/**/*.ts'],
          body: 'Use strict mode.',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };

    expect(generateRules(canonical)).toEqual([
      {
        path: '.claude/rules/ts.md',
        content: '---\ndescription: TS\npaths:\n  - src/**/*.ts\n---\n\nUse strict mode.',
      },
    ]);
  });

  it('keeps the scope through import and generate', async () => {
    write('.claude/rules/backend.md', '---\npaths:\n  - "src/api/**/*.ts"\n---\n\n# Backend\n');

    await runImport({ from: 'claude-code' }, root);
    await runGenerate({}, root, { printMatrix: false });

    expect(frontmatterOf('.claude/rules/backend.md')).toEqual({ paths: ['src/api/**/*.ts'] });
  });
});
