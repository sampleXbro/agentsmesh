/**
 * Codex CLI MCP helpers — TOML server mapping and MCP config import.
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { ImportResult } from '../../core/types.js';
import type { McpServer } from '../../core/types.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { writeMcpWithMerge } from '../import/mcp-merge.js';
import { CODEX_TARGET, CODEX_CONFIG_TOML } from './constants.js';

function stringRecord(raw: unknown): Record<string, string> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};
}

/**
 * Maps a raw `[mcp_servers.<name>]` TOML entry to a canonical stdio server, or
 * `null` when `command` is absent/empty (including remote/URL entries, which
 * `mapUrlTomlServerToCanonical` handles instead).
 */
export function mapTomlServerToCanonical(raw: unknown): McpServer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const command = typeof obj.command === 'string' ? obj.command : '';
  if (!command) return null;

  const args = Array.isArray(obj.args)
    ? obj.args.filter((x): x is string => typeof x === 'string')
    : [];

  return {
    type: 'stdio',
    command,
    args,
    env: stringRecord(obj.env),
  };
}

/**
 * Maps a raw `[mcp_servers.<name>]` TOML entry with a `url` key (Codex's
 * remote/Streamable HTTP transport, per
 * https://developers.openai.com/codex/mcp) to a canonical URL server.
 * `bearer_token_env_var` reconstructs as an `Authorization: Bearer ${VAR}`
 * header so it round-trips through the canonical `headers` map like other
 * targets' bearer-token conventions. Returns `null` when `url` is absent/empty.
 */
export function mapUrlTomlServerToCanonical(raw: unknown): McpServer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const url = typeof obj.url === 'string' ? obj.url : '';
  if (!url) return null;

  const headers = stringRecord(obj.http_headers);
  const bearerEnvVar = typeof obj.bearer_token_env_var === 'string' ? obj.bearer_token_env_var : '';
  if (bearerEnvVar) headers.Authorization = `Bearer \${${bearerEnvVar}}`;

  return {
    type: 'http',
    url,
    headers,
    env: {},
  };
}

export async function importMcp(projectRoot: string, results: ImportResult[]): Promise<void> {
  const configPath = join(projectRoot, CODEX_CONFIG_TOML);
  const content = await readFileSafe(configPath);
  if (content === null) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(content) as Record<string, unknown>;
  } catch {
    return;
  }

  const rawServers = parsed.mcp_servers;
  if (
    !rawServers ||
    typeof rawServers !== 'object' ||
    Array.isArray(rawServers) ||
    Object.keys(rawServers).length === 0
  ) {
    return;
  }

  const mcpServers: Record<string, McpServer> = {};
  for (const [name, val] of Object.entries(rawServers as Record<string, unknown>)) {
    const server = mapTomlServerToCanonical(val) ?? mapUrlTomlServerToCanonical(val);
    if (server) mcpServers[name] = server;
  }

  if (Object.keys(mcpServers).length === 0) return;

  await writeMcpWithMerge(projectRoot, AB_MCP, mcpServers);
  results.push({
    fromTool: CODEX_TARGET,
    fromPath: configPath,
    toPath: AB_MCP,
    feature: 'mcp',
  });
}
