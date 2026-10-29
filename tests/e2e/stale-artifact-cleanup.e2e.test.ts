import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanonicalProject } from './helpers/canonical.js';
import { cleanup } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';
import { fileNotExists } from './helpers/assertions.js';

describe('stale artifact cleanup e2e', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it.each([
    {
      label: 'commands',
      target: 'cursor',
      features: '[rules, commands]',
      canonicalPath: '.agentsmesh/commands',
      stale: ['.cursor/commands/review.md'],
    },
    {
      label: 'agents',
      target: 'claude-code',
      features: '[rules, agents]',
      canonicalPath: '.agentsmesh/agents',
      stale: ['.claude/agents/code-reviewer.md', '.claude/agents/researcher.md'],
    },
    {
      label: 'hooks',
      target: 'copilot',
      features: '[rules, hooks]',
      canonicalPath: '.agentsmesh/hooks.yaml',
      stale: ['.github/hooks/agentsmesh.json', '.github/hooks/scripts/posttooluse-0.sh'],
    },
    {
      label: 'mcp',
      target: 'windsurf',
      features: '[rules, mcp]',
      canonicalPath: '.agentsmesh/mcp.json',
      stale: ['.windsurf/mcp_config.example.json'],
    },
    {
      label: 'permissions',
      target: 'gemini-cli',
      features: '[rules, permissions]',
      canonicalPath: '.agentsmesh/permissions.yaml',
      stale: ['.gemini/policies/permissions.toml'],
    },
    {
      label: 'cline rules dir',
      target: 'cline',
      features: '[rules]',
      canonicalPath: '.agentsmesh/rules/typescript.md',
      stale: ['.cline/rules/typescript.md'],
    },
  ])(
    'deletes stale %s artifacts after canonical removal',
    async ({ target, features, canonicalPath, stale }) => {
      dir = createCanonicalProject(`version: 1
targets: [${target}]
features: ${features}
`);

      expect((await runCli(`generate --targets ${target}`, dir)).exitCode).toBe(0);
      rmSync(join(dir, canonicalPath), { recursive: true, force: true });

      const rerun = await runCli(`generate --targets ${target}`, dir);
      expect(rerun.exitCode, rerun.stderr).toBe(0);

      for (const stalePath of stale) fileNotExists(join(dir, stalePath));
    },
  );

  /**
   * `.roomodes` is Roo's own project custom-modes store, so it is co-owned and
   * never deleted. Revocation is per mode instead: dropping one agent drops its
   * marked mode while the user's own modes stay. Dropping EVERY agent is the
   * documented revocation-to-empty gap — `generateAgents` returns `[]`, nothing
   * is emitted, so the merger never runs and the last marked mode remains.
   */
  it('revokes a single roo-code mode without deleting the co-owned .roomodes', async () => {
    dir = createCanonicalProject(`version: 1
targets: [roo-code]
features: [rules, agents]
`);
    writeFileSync(
      join(dir, '.agentsmesh', 'agents', 'beta.md'),
      '---\ndescription: Beta agent\n---\nBeta body.\n',
    );
    expect((await runCli('generate --targets roo-code', dir)).exitCode).toBe(0);

    const roomodes = join(dir, '.roomodes');
    expect(readFileSync(roomodes, 'utf-8')).toContain('slug: beta');

    rmSync(join(dir, '.agentsmesh', 'agents', 'beta.md'), { force: true });
    const rerun = await runCli('generate --targets roo-code', dir);
    expect(rerun.exitCode, rerun.stderr).toBe(0);

    const after = readFileSync(roomodes, 'utf-8');
    expect(after).not.toContain('slug: beta');
  });
});
