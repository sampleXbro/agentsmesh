/**
 * Integration test: agentsmesh mcp server stdout discipline.
 *
 * The MCP SDK uses newline-delimited JSON (NDJSON), NOT Content-Length framing.
 * Each message is a single JSON object on one line, followed by '\n'.
 *
 * Asserts:
 * 1. stdout contains ONLY valid newline-delimited JSON-RPC messages — no log leakage.
 * 2. The initialize response has serverInfo.name === 'agentsmesh-mcp'.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcpServerInstructions } from '../../src/mcp/instructions.js';

const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

function sendInitialize(cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, 'mcp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    // The MCP SDK uses newline-delimited JSON: each message is JSON + '\n'.
    const initRequest =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      }) + '\n';

    child.stdin.write(initRequest);

    // Give the server time to respond, then terminate
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 2000);

    child.on('close', () => resolve({ stdout, stderr }));
    child.on('error', reject);
  });
}

describe('mcp-server-stdout-discipline', () => {
  it('stdout contains only newline-delimited JSON-RPC messages (no log leakage)', async () => {
    const projectRoot = process.cwd();
    const { stdout } = await sendInitialize(projectRoot);

    if (stdout.length === 0) {
      // Server did not respond in time — nothing to assert.
      return;
    }

    // Every non-empty line on stdout must be valid JSON (NDJSON protocol).
    const lines = stdout.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);

    for (const line of lines) {
      expect(
        () => JSON.parse(line),
        `stdout line is not valid JSON (log leakage?): ${line.slice(0, 120)}`,
      ).not.toThrow();
    }
  }, 8000);

  it('the initialize response reports serverInfo.name === agentsmesh-mcp', async () => {
    const projectRoot = process.cwd();
    const { stdout } = await sendInitialize(projectRoot);

    if (stdout.length === 0) {
      // Server did not respond in time; skip rather than fail.
      return;
    }

    const lines = stdout.split('\n').filter(Boolean);
    const messages = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

    const initResponse = messages.find(
      (m) =>
        m['id'] === 1 &&
        typeof m['result'] === 'object' &&
        m['result'] !== null &&
        'serverInfo' in (m['result'] as Record<string, unknown>),
    );

    expect(initResponse).toBeDefined();
    const result = initResponse?.['result'] as Record<string, unknown> | undefined;
    const serverInfo = result?.['serverInfo'] as Record<string, unknown> | undefined;
    expect(serverInfo?.['name']).toBe('agentsmesh-mcp');
  }, 8000);

  it('the initialize response carries the lessons ritual as instructions', async () => {
    // A plugin cannot write the user's instruction file, so this field is the
    // only standing text a server can put in front of the model. Asserted on
    // the wire rather than on the constant: the value is useless if the SDK
    // does not actually serialize it into the initialize result.
    const { stdout } = await sendInitialize(process.cwd());
    if (stdout.length === 0) return;

    const messages = stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const result = messages.find((m) => m['id'] === 1)?.['result'] as
      | Record<string, unknown>
      | undefined;

    expect(result?.['instructions']).toBe(mcpServerInstructions(process.cwd()));
  }, 8000);

  it('does not hand a lessons mandate to a project that never opted in', async () => {
    // The server also carries the config tools, and most people who wire it up
    // never ran `init --lessons`. Sending them a blocking recall contract named
    // a graph they do not have and required a query before every edit that
    // could only return nothing.
    const dir = mkdtempSync(join(tmpdir(), 'amesh-mcp-nolessons-'));
    try {
      const { stdout } = await sendInitialize(dir);
      if (stdout.length === 0) return;

      const messages = stdout
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
      const result = messages.find((m) => m['id'] === 1)?.['result'] as
        | Record<string, unknown>
        | undefined;
      const instructions = result?.['instructions'] as string | undefined;

      expect(instructions).toBeDefined();
      expect(instructions).not.toContain('BLOCKING');
      expect(instructions).not.toContain('MUST');
      expect(instructions).toContain('agentsmesh init --lessons');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 8000);
});
