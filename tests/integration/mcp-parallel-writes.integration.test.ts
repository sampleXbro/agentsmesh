/**
 * JSON-RPC clients may send several tool calls without waiting. Each write
 * tool reads, changes and writes a file, so parallel calls must not lose each
 * other's changes while every call reports success (#134).
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startMcpServer, toolResult } from '../helpers/mcp-stdio.js';

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-mcp-parallel-')));
  mkdirSync(join(root, '.agentsmesh'), { recursive: true });
  writeFileSync(join(root, 'agentsmesh.yaml'), 'version: 1\ntargets: [claude-code]\n');
  writeFileSync(join(root, '.agentsmesh', 'mcp.json'), '{ "mcpServers": {} }\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('MCP parallel write calls', () => {
  it('keep every change', async () => {
    const server = startMcpServer(root);
    const names = ['s1', 's2', 's3'];

    const writes = await Promise.all([
      ...names.map((name, i) =>
        server.call(1 + i, 'add_mcp_server', {
          name,
          server: { type: 'stdio', command: 'echo', args: [name] },
        }),
      ),
      ...names.map((name, i) =>
        server.call(4 + i, 'update_permissions', { allow: [`Bash(${name})`], mode: 'append' }),
      ),
      ...names.map((name, i) =>
        server.call(7 + i, 'update_ignore', { patterns: [`${name}/`], mode: 'append' }),
      ),
    ]);
    const servers = toolResult(await server.call(10, 'list_mcp_servers', {})) as {
      servers: Record<string, unknown>;
    };
    const perms = toolResult(await server.call(11, 'get_permissions', {})) as { allow: string[] };
    const ignore = toolResult(await server.call(12, 'get_ignore', {})) as { patterns: string[] };
    await server.close();

    writes.forEach((reply) => toolResult(reply));
    expect(Object.keys(servers.servers).sort()).toEqual(names);
    expect([...perms.allow].sort()).toEqual(['Bash(s1)', 'Bash(s2)', 'Bash(s3)']);
    expect([...ignore.patterns].sort()).toEqual(['s1/', 's2/', 's3/']);
  }, 60_000);
});
