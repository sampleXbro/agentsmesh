/**
 * Parse .agentsmesh/mcp.json into McpConfig.
 */

import { stripJsonComments } from '../../utils/text/json-comments.js';
import { failSyntax, type ParseErrorCallback } from './syntax-error.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import type { McpConfig, McpServer } from '../../core/types.js';

function parseStringMap(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function parseServer(raw: unknown): McpServer | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const type = typeof obj.type === 'string' ? obj.type : 'stdio';
  const env = parseStringMap(obj.env);
  const description = typeof obj.description === 'string' ? obj.description : undefined;

  const url = typeof obj.url === 'string' ? obj.url : '';
  if (url) {
    return {
      ...(description !== undefined && { description }),
      type,
      url,
      headers: parseStringMap(obj.headers),
      env,
    };
  }

  const command = typeof obj.command === 'string' ? obj.command : '';
  if (!command) return null;

  const args = Array.isArray(obj.args)
    ? obj.args.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    ...(description !== undefined && { description }),
    type,
    command,
    args,
    env,
  };
}

/**
 * Parse mcp.json at the given path.
 * Supports JSONC (JSON with comments) via comment stripping.
 * @param mcpPath - Absolute path to .agentsmesh/mcp.json
 * @returns McpConfig or null if file missing, malformed, or lacks mcpServers
 */
export async function parseMcp(
  mcpPath: string,
  onParseError?: ParseErrorCallback,
): Promise<McpConfig | null> {
  const content = await readFileSafe(mcpPath);
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(content)) as unknown;
  } catch (err) {
    return failSyntax(mcpPath, err, onParseError);
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const mcpServersRaw = (parsed as Record<string, unknown>).mcpServers;
  if (mcpServersRaw === undefined) return null;
  if (typeof mcpServersRaw !== 'object' || mcpServersRaw === null) return null;
  const mcpServers: Record<string, McpServer> = {};
  for (const [name, val] of Object.entries(mcpServersRaw)) {
    const server = parseServer(val);
    if (server) mcpServers[name] = server;
  }
  return { mcpServers };
}
