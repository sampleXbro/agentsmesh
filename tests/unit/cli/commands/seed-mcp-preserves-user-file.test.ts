/**
 * Seeding the self-serve `agentsmesh` MCP entry must never cost the user the
 * rest of their `mcp.json`. The seeder used to re-read the file through the
 * lossy canonical parser and fall back to an empty document on any parse
 * failure, so one trailing comma replaced every server the user had.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedAgentsmeshMcpEntry } from '../../../../src/cli/commands/seed-mcp-entry.js';

let project: string;
let mcpPath: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'am-seed-preserve-'));
  await mkdir(join(project, '.agentsmesh'), { recursive: true });
  mcpPath = join(project, '.agentsmesh/mcp.json');
});
afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

describe('seedAgentsmeshMcpEntry', () => {
  it('keeps server fields and top-level keys the canonical parser does not model', async () => {
    await writeFile(
      mcpPath,
      JSON.stringify(
        {
          $schema: 'https://example.com/mcp.json',
          disabledMcpjsonServers: ['legacy'],
          mcpServers: {
            mine: {
              command: 'node',
              args: ['server.js'],
              cwd: '/srv/mine',
              disabled: false,
              timeout: 30,
            },
          },
        },
        null,
        2,
      ),
    );

    expect(await seedAgentsmeshMcpEntry(project)).toBe(true);

    const doc = JSON.parse(await readFile(mcpPath, 'utf8')) as Record<string, unknown>;
    expect(doc.$schema).toBe('https://example.com/mcp.json');
    expect(doc.disabledMcpjsonServers).toEqual(['legacy']);
    const servers = doc.mcpServers as Record<string, Record<string, unknown>>;
    expect(servers.mine).toEqual({
      command: 'node',
      args: ['server.js'],
      cwd: '/srv/mine',
      disabled: false,
      timeout: 30,
    });
    expect(servers.agentsmesh).toBeDefined();
  });

  it('leaves a malformed file untouched instead of replacing it', async () => {
    const broken = '{\n  "mcpServers": {\n    "mine": { "command": "node" },\n  }\n}\n';
    await writeFile(mcpPath, broken);

    expect(await seedAgentsmeshMcpEntry(project)).toBe(false);
    expect(await readFile(mcpPath, 'utf8')).toBe(broken);
  });

  it('leaves a commented file untouched rather than stripping the comments', async () => {
    const jsonc = '{\n  // my servers\n  "mcpServers": { "mine": { "command": "node" } }\n}\n';
    await writeFile(mcpPath, jsonc);

    expect(await seedAgentsmeshMcpEntry(project)).toBe(false);
    expect(await readFile(mcpPath, 'utf8')).toBe(jsonc);
  });

  it('leaves a document whose mcpServers is not an object untouched', async () => {
    const wrong = '{ "mcpServers": [] }\n';
    await writeFile(mcpPath, wrong);

    expect(await seedAgentsmeshMcpEntry(project)).toBe(false);
    expect(await readFile(mcpPath, 'utf8')).toBe(wrong);
  });

  it('creates the file when it does not exist', async () => {
    expect(await seedAgentsmeshMcpEntry(project)).toBe(true);
    const doc = JSON.parse(await readFile(mcpPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(doc.mcpServers.agentsmesh).toBeDefined();
  });

  it('does not rewrite a file that already carries the entry', async () => {
    const existing = JSON.stringify({ mcpServers: { agentsmesh: { command: 'custom' } } }, null, 4);
    await writeFile(mcpPath, existing);

    expect(await seedAgentsmeshMcpEntry(project)).toBe(false);
    expect(await readFile(mcpPath, 'utf8')).toBe(existing);
  });
});
