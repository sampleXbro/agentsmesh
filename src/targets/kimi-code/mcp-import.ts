/**
 * `.kimi-code/mcp.json` -> canonical MCP servers.
 *
 * The shared `mcpJson` import mode reads the canonical `type` key and defaults a
 * URL server to `http`. Kimi Code's own key is `transport`, so a hand-authored
 * `{"transport": "sse", "url": ...}` would land in canonical as `http` and the
 * next generate would break the user's SSE server. `transport` therefore wins
 * here, with `type` as the fallback for a file agentsmesh wrote (it carries
 * both) or a file copied from another tool.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { McpServer } from '../../core/types.js';
import { toStringArray, toStringRecord } from '../import/shared-import-helpers.js';

function transportOf(server: Record<string, unknown>, fallback: string): string {
  if (typeof server.transport === 'string') return server.transport;
  return typeof server.type === 'string' ? server.type : fallback;
}

function toServer(server: Record<string, unknown>): McpServer | null {
  const description = typeof server.description === 'string' ? server.description : undefined;
  if (typeof server.command === 'string') {
    return {
      type: transportOf(server, 'stdio'),
      command: server.command,
      args: toStringArray(server.args),
      env: toStringRecord(server.env),
      description,
    };
  }
  if (typeof server.url === 'string') {
    return {
      type: transportOf(server, 'http'),
      url: server.url,
      headers: toStringRecord(server.headers),
      env: toStringRecord(server.env),
      description,
    };
  }
  return null;
}

export function parseKimiMcp(content: string): Record<string, McpServer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) return {};

  const servers: Record<string, McpServer> = {};
  for (const [name, value] of Object.entries(parsed.mcpServers)) {
    if (!isRecord(value)) continue;
    const server = toServer(value);
    if (server !== null) servers[name] = server;
  }
  return servers;
}
