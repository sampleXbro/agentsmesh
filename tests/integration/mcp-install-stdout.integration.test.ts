/**
 * The MCP `install` and `uninstall` tools must keep stdout for JSON-RPC only:
 * the broken-link and locally-modified notices go to stderr (#133).
 */

import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startMcpServer } from '../helpers/mcp-stdio.js';

let base: string;

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

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
    const server = startMcpServer(join(base, 'proj'));
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
