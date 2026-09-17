import { describe, expect, it } from 'vitest';
import { runLint } from '../../../src/core/lint/linter.js';
import type { CanonicalFiles, CanonicalCommand } from '../../../src/core/types.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import { TARGET_IDS } from '../../../src/targets/catalog/target-ids.js';

const baseConfig: ValidatedConfig = {
  version: 1,
  targets: [...TARGET_IDS],
  features: ['rules', 'commands', 'agents', 'skills', 'mcp', 'hooks', 'ignore', 'permissions'],
  extends: [],
  overrides: {},
  collaboration: { strategy: 'merge', lock_features: [] },
};

const emptyCanonical: CanonicalFiles = {
  rules: [],
  commands: [],
  agents: [],
  skills: [],
  mcp: null,
  permissions: null,
  hooks: null,
  ignore: [],
};

describe('runLint dispatches to descriptor lint hooks', () => {
  it('uses copilot lint.commands when commands feature is enabled', async () => {
    const command: CanonicalCommand = {
      source: '.agentsmesh/commands/x.md',
      name: 'x',
      description: '',
      allowedTools: ['Read'],
      body: '',
    };
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['copilot'],
      features: ['commands'],
    };
    const { diagnostics } = await runLint(
      config,
      { ...emptyCanonical, commands: [command] },
      '/tmp',
    );
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0]?.target).toBe('copilot');
  });

  it('uses cursor lint.mcp when mcp feature is enabled', async () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['cursor'],
      features: ['mcp'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      mcp: {
        mcpServers: {
          fs: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: { KEY: '${HOME}' },
          },
        },
      },
    };
    const { diagnostics } = await runLint(config, canonical, '/tmp');
    expect(diagnostics.some((d) => d.message.includes('interpolation'))).toBe(true);
  });
});
