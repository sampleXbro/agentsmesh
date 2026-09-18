/**
 * Global-scope MCP support for Copilot CLI: ~/.copilot/mcp-config.json,
 * `mcpServers` key (docs.github.com/en/copilot/how-tos/copilot-cli/
 * customize-copilot/add-mcp-servers). Generator + importer round-trip.
 */

import { AB_MCP } from '../../../../src/core/canonical-paths.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateCopilotGlobalMcp,
  importCopilotGlobalMcp,
} from '../../../../src/targets/copilot/global-mcp.js';

import type { CanonicalFiles, ImportResult } from '../../../../src/core/types.js';

function emptyCanonical(): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

describe('generateCopilotGlobalMcp', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cop-global-mcp-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns [] when there are no canonical MCP servers', async () => {
    expect(await generateCopilotGlobalMcp(emptyCanonical(), root)).toEqual([]);
    expect(
      await generateCopilotGlobalMcp({ ...emptyCanonical(), mcp: { mcpServers: {} } }, root),
    ).toEqual([]);
  });

  it('emits .copilot/mcp-config.json under the `mcpServers` key (not `servers`)', async () => {
    const result = await generateCopilotGlobalMcp(
      {
        ...emptyCanonical(),
        mcp: { mcpServers: { docs: { type: 'stdio', command: 'npx', args: ['-y'], env: {} } } },
      },
      root,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe('.copilot/mcp-config.json');
    const parsed = JSON.parse(result[0]!.content) as Record<string, unknown>;
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.servers).toBeUndefined();
    expect(result[0]!.status).toBe('created');
  });

  it('reports status="unchanged" when existing content matches', async () => {
    const canonical: CanonicalFiles = {
      ...emptyCanonical(),
      mcp: { mcpServers: { docs: { type: 'stdio', command: 'npx', args: [], env: {} } } },
    };
    const first = await generateCopilotGlobalMcp(canonical, root);
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(join(root, '.copilot', 'mcp-config.json'), first[0]!.content);
    const second = await generateCopilotGlobalMcp(canonical, root);
    expect(second[0]!.status).toBe('unchanged');
  });

  it('reports status="updated" when existing content differs', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(join(root, '.copilot', 'mcp-config.json'), '{"mcpServers":{}}');
    const result = await generateCopilotGlobalMcp(
      {
        ...emptyCanonical(),
        mcp: { mcpServers: { docs: { type: 'stdio', command: 'npx', args: [], env: {} } } },
      },
      root,
    );
    expect(result[0]!.status).toBe('updated');
  });
});

describe('importCopilotGlobalMcp', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cop-global-mcp-import-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('imports ~/.copilot/mcp-config.json (mcpServers key) into canonical mcp.json', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(
      join(root, '.copilot', 'mcp-config.json'),
      JSON.stringify({ mcpServers: { docs: { command: 'npx', args: ['-y'] } } }),
    );
    const results: ImportResult[] = [];
    await importCopilotGlobalMcp(root, results);
    expect(results).toEqual([
      {
        fromTool: 'copilot',
        fromPath: join(root, '.copilot', 'mcp-config.json'),
        toPath: AB_MCP,
        feature: 'mcp',
      },
    ]);
    const written = JSON.parse(readFileSync(join(root, AB_MCP), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(written.mcpServers.docs).toBeDefined();
  });

  it('does nothing when the file is absent', async () => {
    const results: ImportResult[] = [];
    await importCopilotGlobalMcp(root, results);
    expect(results).toEqual([]);
  });

  it('does nothing when the file is malformed JSON', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(join(root, '.copilot', 'mcp-config.json'), '{not valid');
    const results: ImportResult[] = [];
    await importCopilotGlobalMcp(root, results);
    expect(results).toEqual([]);
  });

  it('does nothing when `mcpServers` is absent or empty', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(join(root, '.copilot', 'mcp-config.json'), JSON.stringify({ mcpServers: {} }));
    const results: ImportResult[] = [];
    await importCopilotGlobalMcp(root, results);
    expect(results).toEqual([]);
  });

  it('does nothing when the top-level parsed JSON is not an object', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    for (const raw of ['42', '"a string"', 'null', '[1,2,3]']) {
      writeFileSync(join(root, '.copilot', 'mcp-config.json'), raw);
      const results: ImportResult[] = [];
      await importCopilotGlobalMcp(root, results);
      expect(results).toEqual([]);
    }
  });

  it('does nothing when `mcpServers` key is entirely absent', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(join(root, '.copilot', 'mcp-config.json'), JSON.stringify({ other: true }));
    const results: ImportResult[] = [];
    await importCopilotGlobalMcp(root, results);
    expect(results).toEqual([]);
  });

  it('does nothing when `mcpServers` is an array instead of an object', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(join(root, '.copilot', 'mcp-config.json'), JSON.stringify({ mcpServers: [] }));
    const results: ImportResult[] = [];
    await importCopilotGlobalMcp(root, results);
    expect(results).toEqual([]);
  });

  it('skips non-object server entry values while keeping valid ones', async () => {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(
      join(root, '.copilot', 'mcp-config.json'),
      JSON.stringify({
        mcpServers: { bogus: 'not-an-object', bogusArray: ['x'], docs: { command: 'npx' } },
      }),
    );
    const results: ImportResult[] = [];
    await importCopilotGlobalMcp(root, results);
    expect(results).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(root, AB_MCP), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(written.mcpServers)).toEqual(['docs']);
  });
});
