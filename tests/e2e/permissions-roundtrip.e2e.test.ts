import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestProject, cleanup } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';
import { readJson, readText, readYaml } from './helpers/assertions.js';

function writeProject(dir: string, target: string): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(dir, 'agentsmesh.yaml'),
    `version: 1\ntargets: [${target}]\nfeatures: [rules, permissions]\n`,
  );
  writeFileSync(join(dir, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
  writeFileSync(
    join(dir, '.agentsmesh', 'permissions.yaml'),
    [
      'allow:',
      '  - Read',
      '  - Bash(pnpm test:*)',
      '  - Read',
      'deny:',
      '  - Read(./.env)',
      '  - Bash(curl:*)',
      '  - Read(./.env)',
      '',
    ].join('\n'),
  );
}

describe('permissions round-trip e2e', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('round-trips Claude permissions with duplicate entry ordering preserved', async () => {
    dir = createTestProject();
    writeProject(dir, 'claude-code');

    expect((await runCli('generate --targets claude-code', dir)).exitCode).toBe(0);
    expect(readJson(join(dir, '.claude', 'settings.json'))).toMatchObject({
      permissions: {
        allow: ['Read', 'Bash(pnpm test:*)'],
        deny: ['Read(./.env)', 'Bash(curl:*)'],
      },
    });

    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });
    expect((await runCli('import --from claude-code', dir)).exitCode).toBe(0);
    expect(readYaml(join(dir, '.agentsmesh', 'permissions.yaml'))).toMatchObject({
      allow: ['Read', 'Bash(pnpm test:*)'],
      // Claude Read path exclusions are classified as canonical ignore,
      // while command/tool denies remain canonical permissions.
      deny: ['Bash(curl:*)'],
    });
    expect(readText(join(dir, '.agentsmesh', 'ignore'))).toContain('.env');
  });

  // Gemini's policy engine documents its Workspace tier as non-functional, so project
  // scope must stay empty and warn; the global round-trip lives in
  // tests/e2e/global-roundtrip-gemini.e2e.test.ts.
  it('does not write Gemini permissions into the project and warns instead', async () => {
    dir = createTestProject();
    writeProject(dir, 'gemini-cli');

    expect((await runCli('generate --targets gemini-cli', dir)).exitCode).toBe(0);
    expect(existsSync(join(dir, '.gemini', 'policies', 'permissions.toml'))).toBe(false);

    const lint = await runCli('lint --targets gemini-cli', dir);
    expect(lint.stdout + lint.stderr).toContain('~/.gemini/policies');
  });

  it('round-trips Cursor permissions through cli.json with no lint warning (native capability)', async () => {
    dir = createTestProject();
    writeProject(dir, 'cursor');

    // cursor permissions are native — no partial-fidelity warning should appear
    const lintBefore = await runCli('lint --targets cursor', dir);
    expect(lintBefore.stdout + lintBefore.stderr).not.toContain(
      'Cursor permissions are partial; tool-level allow/deny may lose fidelity.',
    );

    expect((await runCli('generate --targets cursor', dir)).exitCode).toBe(0);
    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });
    expect((await runCli('import --from cursor', dir)).exitCode).toBe(0);
    expect(existsSync(join(dir, '.agentsmesh', 'permissions.yaml'))).toBe(true);
    expect(readYaml(join(dir, '.agentsmesh', 'permissions.yaml'))).toMatchObject({
      allow: ['Read', 'Bash(pnpm test:*)'],
      deny: ['Read(./.env)', 'Bash(curl:*)'],
    });
  });
});
