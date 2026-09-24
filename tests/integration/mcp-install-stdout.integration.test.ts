/**
 * The MCP `install` and `uninstall` tools must keep stdout for JSON-RPC only:
 * the broken-link and locally-modified notices go to stderr (#133).
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

let base: string;

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

interface Session {
  call: (id: number, name: string, args: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<{ stdout: string; stderr: string }>;
}

function startServer(cwd: string): Session {
  const child: ChildProcessWithoutNullStreams = spawn('node', [CLI_PATH, 'mcp'], { cwd });
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
        // A non-JSON line is what this test catches; it is asserted below.
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

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-mcp-install-out-')));
  write(
    join(base, 'proj', 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, skills]\n',
  );
  write(join(base, 'proj', '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
  write(
    join(base, 'src', 'skills', 'ap', 'SKILL.md'),
    '---\ndescription: ap\n---\n# AP\nSee [m](../../nope.md).\n',
  );
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('MCP install and uninstall stdout', () => {
  it('writes only JSON-RPC to stdout and the notices to stderr', async () => {
    const server = startServer(join(base, 'proj'));
    const source = join(base, 'src');

    const replies = [
      await server.call(1, 'install', { source, name: 'appack', dry_run: true }),
      await server.call(2, 'install', { source, name: 'appack' }),
    ];
    appendFileSync(
      join(base, 'proj', '.agentsmesh', 'packs', 'appack', 'skills', 'ap', 'SKILL.md'),
      'EDIT\n',
    );
    replies.push(await server.call(3, 'uninstall', { names: ['appack'] }));
    const { stdout, stderr } = await server.close();

    const notJson = stdout
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        try {
          JSON.parse(line);
          return false;
        } catch {
          return true;
        }
      });
    expect(notJson).toEqual([]);
    const failed = (r: unknown): boolean => {
      const reply = r as { error?: unknown; result?: { isError?: boolean } };
      return reply.error !== undefined || reply.result?.isError === true;
    };
    expect(replies.map(failed)).toEqual([false, false, false]);
    expect(stderr).toContain('Entity "ap" (skill) has 1 broken link:');
    expect(stderr).toContain('Pack "appack" has 1 locally modified file:');
  }, 60_000);
});
