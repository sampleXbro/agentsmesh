import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanonicalProject } from './helpers/canonical.js';
import { createTestProject, cleanup } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';
import { fileExists, fileContains, readYaml } from './helpers/assertions.js';

describe('generate descriptor fixes', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('roo-code project: agents → .roomodes with customModes YAML', async () => {
    dir = createCanonicalProject(`version: 1
targets: [roo-code]
features: [rules, agents]
`);

    const result = await runCli('generate --targets roo-code', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileExists(join(dir, '.roomodes'));
    fileContains(join(dir, '.roomodes'), 'customModes');
    fileContains(join(dir, '.roomodes'), 'code-reviewer');
    fileContains(join(dir, '.roomodes'), 'Code review specialist');

    const modes = readYaml(join(dir, '.roomodes'));
    const customModes = modes.customModes as Array<Record<string, unknown>>;
    expect(Array.isArray(customModes)).toBe(true);
    expect(customModes.length).toBe(2);
    const reviewer = customModes.find((m) => m.slug === 'code-reviewer');
    expect(reviewer).toBeDefined();
    expect(reviewer!.description).toBe('Code review specialist');
    expect(String(reviewer!.roleDefinition ?? '')).toContain('code reviewer');
  });

  it('windsurf: a directory-scoped glob rule is written once, with no src/AGENTS.md', async () => {
    dir = createTestProject();
    mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(dir, '.agentsmesh', 'rules', '_root.md'),
      '---\ndescription: Root\n---\n# Root\nRoot instructions\n',
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'rules', 'src-guide.md'),
      '---\ndescription: Src guide\nglobs: ["src/**/*.ts"]\n---\n# Src\nSrc-specific guidance\n',
    );
    writeFileSync(
      join(dir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [windsurf]\nfeatures: [rules]\n',
    );

    const gen = await runCli('generate --targets windsurf', dir);
    expect(gen.exitCode, gen.stderr).toBe(0);
    fileContains(join(dir, '.windsurf', 'rules', 'src-guide.md'), 'Src-specific guidance');
    expect(existsSync(join(dir, '.windsurf', 'rules', 'src.md'))).toBe(false);
    expect(existsSync(join(dir, 'src', 'AGENTS.md'))).toBe(false);
  });
});
