/**
 * A tiny JSON-RPC client for `node dist/cli.js mcp` over stdio. `call` sends a
 * tools/call and resolves with the reply that has the same id; calls made
 * together are sent without waiting for each other.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';

const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

export interface McpStdioSession {
  call: (id: number, name: string, args: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<{ stdout: string; stderr: string }>;
}

export function startMcpServer(cwd: string): McpStdioSession {
  const child = spawn('node', [CLI_PATH, 'mcp'], { cwd });
  let stdout = '';
  let stderr = '';
  const waiting = new Map<number, (msg: unknown) => void>();
  child.stdout.on('data', (d: Buffer) => {
    stdout += d.toString();
    for (const line of d.toString().split('\n').filter(Boolean)) {
      try {
        const msg = JSON.parse(line) as { id?: number };
        if (msg.id !== undefined) waiting.get(msg.id)?.(msg);
      } catch {
        // Tests assert on stdout lines that are not JSON.
      }
    }
  });
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  const send = (msg: object): void => void child.stdin.write(`${JSON.stringify(msg)}\n`);
  const request = (id: number, method: string, params: object): Promise<unknown> =>
    new Promise((resolve) => {
      waiting.set(id, resolve);
      send({ jsonrpc: '2.0', id, method, params });
    });
  const ready = request(0, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  }).then(() => send({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  return {
    call: async (id, name, args) => {
      await ready;
      return request(id, 'tools/call', { name, arguments: args });
    },
    close: () =>
      new Promise((resolve) => {
        child.on('close', () => resolve({ stdout, stderr }));
        child.stdin.end();
        child.kill('SIGTERM');
      }),
  };
}

/** The JSON a successful tools/call reply carries, or the error text. */
export function toolResult(reply: unknown): unknown {
  const r = reply as {
    error?: unknown;
    result?: { isError?: boolean; content?: [{ text: string }] };
  };
  if (r.error !== undefined || r.result?.isError === true) {
    throw new Error(`tool call failed: ${JSON.stringify(reply)}`);
  }
  return JSON.parse(r.result?.content?.[0]?.text ?? 'null') as unknown;
}
