/**
 * Project init adds the agentsmesh MCP server even when the import, not the
 * template, writes `.agentsmesh/mcp.json`, and a later import of the commented
 * template stays silent.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../../../../src/cli/commands/init.js';
import { runImport } from '../../../../src/cli/commands/import.js';
import { TEMPLATE_MCP } from '../../../../src/cli/commands/init-mcp-templates.js';

const TEST_DIR = join(tmpdir(), 'am-init-seeds-mcp-entry-test');
const EMPTY_HOME = join(tmpdir(), 'am-init-seeds-mcp-entry-home');
const MCP_PATH = join(TEST_DIR, '.agentsmesh', 'mcp.json');

let stderr: MockInstance<typeof process.stderr.write>;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(EMPTY_HOME, { recursive: true });
  vi.stubEnv('HOME', EMPTY_HOME);
  vi.stubEnv('USERPROFILE', EMPTY_HOME);
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
  stderr.mockRestore();
  vi.unstubAllEnvs();
  rmSync(TEST_DIR, { recursive: true, force: true });
  rmSync(EMPTY_HOME, { recursive: true, force: true });
});

function serverKeys(): string[] {
  const doc = JSON.parse(readFileSync(MCP_PATH, 'utf-8')) as { mcpServers: object };
  return Object.keys(doc.mcpServers);
}

function writeClaudeProject(withMcp: boolean): void {
  writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
  if (!withMcp) return;
  writeFileSync(
    join(TEST_DIR, '.mcp.json'),
    JSON.stringify({ mcpServers: { mine: { command: 'my-tool', args: [] } } }, null, 2),
  );
}

describe('project init and the agentsmesh MCP server', () => {
  it('init --yes adds the entry next to the imported MCP servers', async () => {
    writeClaudeProject(true);

    await runInit(TEST_DIR, { yes: true });

    expect(serverKeys()).toEqual(['mine', 'agentsmesh']);
  });

  it('init --yes and import --from claude-code give the same servers', async () => {
    writeClaudeProject(true);
    await runInit(TEST_DIR, { yes: true });
    const afterInit: unknown = JSON.parse(readFileSync(MCP_PATH, 'utf-8'));

    await runImport({ from: 'claude-code' }, TEST_DIR);

    expect(serverKeys()).toEqual(['mine', 'agentsmesh']);
    expect(JSON.parse(readFileSync(MCP_PATH, 'utf-8'))).toEqual(afterInit);
  });

  it('import after init keeps the commented template and prints no warning', async () => {
    await runInit(TEST_DIR, {});
    writeClaudeProject(false);

    await runImport({ from: 'claude-code' }, TEST_DIR);

    expect(readFileSync(MCP_PATH, 'utf-8')).toBe(TEMPLATE_MCP);
    expect(stderr).not.toHaveBeenCalled();
  });
});
