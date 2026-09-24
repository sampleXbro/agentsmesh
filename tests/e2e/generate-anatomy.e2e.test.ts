import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, createTestProject } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';
import { fileContains } from './helpers/assertions.js';

describe('generate anatomy variants', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('generates Cursor AGENTS.md compatibility mirror alongside .cursor/rules/general.mdc', async () => {
    dir = createTestProject('canonical-full');

    const result = await runCli('generate --targets cursor', dir);

    expect(result.exitCode).toBe(0);
    const agentsMd = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    const generalMdc = readFileSync(join(dir, '.cursor', 'rules', 'general.mdc'), 'utf-8');
    // AGENTS.md is plain body, general.mdc has frontmatter
    expect(generalMdc).toContain('alwaysApply: true');
    expect(agentsMd).not.toContain('alwaysApply');
    expect(agentsMd.length).toBeGreaterThan(0);
  });

  it('generates Windsurf Codeium ignore at the official path', async () => {
    dir = createTestProject('canonical-full');

    const result = await runCli('generate --targets windsurf', dir);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, '.codeiumignore'), 'utf-8')).toContain('node_modules');
  });

  it('generates a nested Codex src/AGENTS.md for scoped advisory rules (no root-file link needed)', async () => {
    dir = createTestProject();
    mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(dir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [codex-cli]\nfeatures: [rules]\n',
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\n# Root rules\n',
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'rules', 'src.md'),
      '---\ndescription: Src rules\nglobs:\n  - src/**/*.ts\n---\n# Src rules\nUse strict mode.\n',
    );

    const result = await runCli('generate', dir);

    expect(result.exitCode).toBe(0);
    fileContains(join(dir, 'src', 'AGENTS.md'), 'Use strict mode.');
  });

  it('generates a Windsurf glob rule, not a subdirectory AGENTS.md, from a scoped rule', async () => {
    dir = createTestProject();
    mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(dir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [windsurf]\nfeatures: [rules]\n',
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\n# Root rules\n',
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'rules', 'src.md'),
      '---\ndescription: Src rules\nglobs:\n  - src/**/*.ts\n---\n# Src windsurf rules\nUse strict mode.\n',
    );

    const result = await runCli('generate', dir);

    expect(result.exitCode).toBe(0);
    // Windsurf also reads src/AGENTS.md as a src/** rule, so one glob rule is enough.
    expect(readFileSync(join(dir, '.windsurf', 'rules', 'src.md'), 'utf-8')).toBe(
      '---\ndescription: Src rules\ntrigger: glob\nglobs: src/**/*.ts\n---\n\n# Src windsurf rules\nUse strict mode.',
    );
    expect(existsSync(join(dir, 'src', 'AGENTS.md'))).toBe(false);
  });
});
