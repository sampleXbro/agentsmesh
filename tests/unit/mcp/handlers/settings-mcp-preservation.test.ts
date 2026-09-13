import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { SETTINGS_TOOL_DESCRIPTORS } from '../../../../src/mcp/tool-tables/settings-tools.js';

let projectRoot: string;
let mcpPath: string;
let ctx: McpContext;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'mcp-preservation-'));
  await mkdir(join(projectRoot, '.agentsmesh'));
  mcpPath = join(projectRoot, '.agentsmesh', 'mcp.json');
  ctx = {
    projectRoot,
    loadCanonical: async () => {
      throw new Error('unused');
    },
  };
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

async function invoke(name: string, input: Record<string, unknown>): Promise<unknown> {
  const descriptor = SETTINGS_TOOL_DESCRIPTORS.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Missing tool ${name}`);
  return descriptor.handler(ctx, descriptor.inputSchema.parse(input));
}

describe('MCP server mutation preservation', () => {
  it.each(['{"mcpServers":{"kept":{"command":"node"}}, BROKEN', 'null', '[]', '{"mcpServers":[]}'])(
    'rejects an invalid existing document without overwriting: %s',
    async (content) => {
      await writeFile(mcpPath, content);
      await expect(
        invoke('add_mcp_server', { name: 'new', server: { command: 'npx' } }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await readFile(mcpPath, 'utf8')).toBe(content);
    },
  );

  it.each(['add_mcp_server', 'update_mcp_server', 'remove_mcp_server'])(
    'preserves every untouched field during %s',
    async (operation) => {
      const kept = {
        command: 'node',
        args: ['server.js'],
        disabled: true,
        cwd: '/tmp/server',
        timeout: 2500,
        futureOption: { nested: true },
      };
      const document = {
        $schema: 'https://example.test/mcp.schema.json',
        extension: { preserve: true },
        mcpServers: { kept, edited: { command: 'node' } },
      };
      await writeFile(mcpPath, '// canonical JSONC\n' + JSON.stringify(document));
      await invoke(operation, {
        name: operation === 'add_mcp_server' ? 'new' : 'edited',
        ...(operation === 'remove_mcp_server' ? {} : { server: { command: 'npx' } }),
      });
      const next: unknown = JSON.parse(await readFile(mcpPath, 'utf8'));
      const expectedServers =
        operation === 'add_mcp_server'
          ? { ...document.mcpServers, new: { command: 'npx' } }
          : operation === 'update_mcp_server'
            ? { kept, edited: { command: 'npx' } }
            : { kept };
      expect(next).toEqual({ ...document, mcpServers: expectedServers });
    },
  );

  it('preserves server options during a partial merge', async () => {
    const original = { command: 'node', disabled: true, cwd: '/tmp/server', timeout: 2500 };
    await writeFile(mcpPath, JSON.stringify({ mcpServers: { kept: original } }));
    await invoke('update_mcp_server', { name: 'kept', server: { timeout: 5000 }, merge: true });
    expect(JSON.parse(await readFile(mcpPath, 'utf8'))).toEqual({
      mcpServers: { kept: { ...original, timeout: 5000 } },
    });
  });
});
