/**
 * Branch coverage for src/cli/commands/import.ts lines 84-86 — the plugin
 * descriptor success path (non-builtin target with a registered descriptor).
 *
 * We mock the registry's getDescriptor to return a stub descriptor, and
 * seedAgentsmeshMcpEntry to a no-op spy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hoisted = vi.hoisted(() => ({
  importFromStub: vi.fn(),
  seedStub: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/targets/catalog/registry.js', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    getDescriptor: vi.fn((name: string) => {
      if (name === 'pluginish') {
        return {
          id: 'pluginish',
          generators: { importFrom: hoisted.importFromStub },
        };
      }
      return undefined;
    }),
  };
});

vi.mock('../../../../src/cli/commands/seed-mcp-entry.js', () => ({
  seedAgentsmeshMcpEntry: hoisted.seedStub,
}));

vi.mock('../../../../src/plugins/bootstrap-plugins.js', () => ({
  bootstrapPlugins: vi.fn().mockResolvedValue(undefined),
}));

import { runImport } from '../../../../src/cli/commands/import.js';

let testDir = '';

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'amesh-import-final-'));
  mkdirSync(join(testDir, '.agentsmesh'), { recursive: true });
  writeFileSync(
    join(testDir, 'agentsmesh.yaml'),
    `version: 1\ntargets: [claude-code]\nfeatures: [rules]\n`,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(testDir, { recursive: true, force: true });
  hoisted.importFromStub.mockReset();
  hoisted.seedStub.mockClear();
});

describe('runImport — descriptor importFrom success path', () => {
  it('invokes descriptor importFrom, seeds MCP, and returns mapped results', async () => {
    hoisted.importFromStub.mockResolvedValueOnce([
      { fromPath: join(testDir, 'from.md'), toPath: '.agentsmesh/rules/from.md' },
    ]);

    const result = await runImport({ from: 'pluginish' }, testDir);

    expect(hoisted.importFromStub).toHaveBeenCalledTimes(1);
    expect(hoisted.seedStub).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('pluginish');
    expect(result.data.files).toEqual([{ from: 'from.md', to: '.agentsmesh/rules/from.md' }]);
  });

  it('skips seedAgentsmeshMcpEntry when descriptor returns no results', async () => {
    hoisted.importFromStub.mockResolvedValueOnce([]);

    const result = await runImport({ from: 'pluginish' }, testDir);

    expect(hoisted.importFromStub).toHaveBeenCalledTimes(1);
    expect(hoisted.seedStub).not.toHaveBeenCalled();
    expect(result.data.files).toEqual([]);
  });

  it('skips seedAgentsmeshMcpEntry on a global import', async () => {
    const home = join(testDir, 'home');
    mkdirSync(join(home, '.agentsmesh'), { recursive: true });
    writeFileSync(
      join(home, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1\ntargets: [claude-code]\nfeatures: [rules]\n`,
    );
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    hoisted.importFromStub.mockResolvedValueOnce([
      { fromPath: join(home, 'from.md'), toPath: '.agentsmesh/rules/from.md' },
    ]);

    const result = await runImport({ from: 'pluginish', global: true }, testDir);

    expect(hoisted.importFromStub).toHaveBeenCalledTimes(1);
    expect(hoisted.seedStub).not.toHaveBeenCalled();
    expect(result.data.scope).toBe('global');
    expect(result.data.files).toEqual([{ from: 'from.md', to: '.agentsmesh/rules/from.md' }]);
  });
});
