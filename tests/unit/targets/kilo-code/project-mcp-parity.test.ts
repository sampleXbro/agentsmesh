import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateMcp, generatePermissions } from '../../../../src/targets/kilo-code/generator.js';
import { mergeKiloConfig } from '../../../../src/targets/kilo-code/merge.js';
import { importFromKiloCode } from '../../../../src/targets/kilo-code/importer.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'kilo-project-mcp-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

function canonical(overrides: Partial<CanonicalFiles>): CanonicalFiles {
  return { rules: [], commands: [], agents: [], skills: [], mcp: null,
    permissions: null, hooks: null, ignore: [], ...overrides };
}

describe('Kilo MCP project capability (vendor config contract)', () => {
  it('writes project kilo.jsonc with native mcp key and local/remote server schema', () => {
    const generated = generateMcp(canonical({ mcp: { mcpServers: {
      local: { type: 'stdio', command: 'node', args: ['server.js'], env: { A: '1' } },
      remote: { type: 'url', url: 'https://example.com/mcp', headers: {}, env: {} },
    } } }));
    expect(generated).toHaveLength(1);
    expect(generated[0]!.path).toBe('kilo.jsonc');
    expect(JSON.parse(generated[0]!.content)).toEqual({ mcp: {
      local: { type: 'local', command: ['node', 'server.js'], environment: { A: '1' } },
      remote: { type: 'remote', url: 'https://example.com/mcp' },
    } });
  });

  it('merges project MCP with project permissions in the same file', () => {
    const input = canonical({
      mcp: { mcpServers: { local: { type: 'stdio', command: 'node', args: [], env: {} } } },
      permissions: { allow: ['read'], deny: [], ask: [] },
    });
    const permissions = generatePermissions(input)[0]!;
    const mcp = generateMcp(input)[0]!;
    const merged = mergeKiloConfig(permissions.content, null, mcp.content, 'kilo.jsonc');
    expect(JSON.parse(merged!)).toEqual({
      permission: { read: 'allow' },
      mcp: { local: { type: 'local', command: ['node'] } },
    });
  });

  it('imports project kilo.jsonc MCP as canonical servers', async () => {
    writeFileSync(join(root, 'kilo.jsonc'), JSON.stringify({ mcp: {
      local: { type: 'local', command: ['node', 'server.js'], environment: { A: '1' } },
    } }));
    const results = await importFromKiloCode(root);
    expect(results.filter((result) => result.feature === 'mcp')).toHaveLength(1);
    expect(results.find((result) => result.feature === 'mcp')?.fromPath)
      .toBe(join(root, 'kilo.jsonc'));
    const imported = JSON.parse(readFileSync(join(root, '.agentsmesh', 'mcp.json'), 'utf-8'));
    expect(imported.mcpServers.local).toMatchObject({
      type: 'stdio', command: 'node', args: ['server.js'], env: { A: '1' },
    });
  });

  it('preserves legacy MCP read compatibility', async () => {
    mkdirSync(join(root, '.kilocode'), { recursive: true });
    writeFileSync(join(root, '.kilocode', 'mcp.json'), JSON.stringify({
      mcpServers: { legacy: { type: 'stdio', command: 'node', args: [], env: {} } },
    }));
    const results = await importFromKiloCode(root);
    expect(results.filter((result) => result.feature === 'mcp')).toHaveLength(1);
  });
});
