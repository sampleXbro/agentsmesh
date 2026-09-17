/**
 * Cline MCP server mapping helpers — converts Cline MCP settings to canonical format.
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { McpServer } from '../../core/types.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import {
  CLINE_TARGET,
  CLINE_MCP_SETTINGS,
  CLINE_MCP_SETTINGS_LEGACY,
  CLINE_MCP_SETTINGS_LEGACY_AGENTSMESH,
} from './constants.js';

/** Filter an unknown record down to its string-valued string-keyed entries. */
function toStringRecord(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export function mapClineServerToCanonical(raw: unknown): McpServer | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const transport = typeof obj.type === 'string' ? obj.type : undefined;
  const transportType = typeof obj.transportType === 'string' ? obj.transportType : undefined;
  const env = toStringRecord(obj.env);
  const description = typeof obj.description === 'string' ? obj.description : undefined;

  const command = typeof obj.command === 'string' ? obj.command : '';
  if (command) {
    const args = Array.isArray(obj.args)
      ? obj.args.filter((x): x is string => typeof x === 'string')
      : [];
    return {
      ...(description !== undefined && { description }),
      type: transport ?? transportType ?? 'stdio',
      command,
      args,
      env,
    };
  }

  // URL/HTTP/SSE servers carry a `url` and no `command`. Without this branch a
  // generate -> re-import round-trip through Cline silently drops every remote
  // MCP server (cline's generator emits canonical url servers verbatim).
  if (typeof obj.url === 'string') {
    return {
      ...(description !== undefined && { description }),
      type: transport ?? transportType ?? 'http',
      url: obj.url,
      headers: toStringRecord(obj.headers),
      env,
    };
  }

  return null;
}

export async function importClineMcp(projectRoot: string, results: ImportResult[]): Promise<void> {
  // Primary path first, then legacy filenames (including the old
  // agentsmesh-generated `.cline/cline_mcp_settings.json` name) as fallbacks
  // so existing repos still import correctly after the filename fix.
  const candidatePaths = [
    CLINE_MCP_SETTINGS,
    CLINE_MCP_SETTINGS_LEGACY,
    CLINE_MCP_SETTINGS_LEGACY_AGENTSMESH,
  ].map((path) => join(projectRoot, path));
  let mcpPath: string | null = null;
  let mcpContent: string | null = null;

  for (const candidatePath of candidatePaths) {
    const candidateContent = await readFileSafe(candidatePath);
    if (candidateContent !== null) {
      mcpPath = candidatePath;
      mcpContent = candidateContent;
      break;
    }
  }

  if (mcpContent === null) return;
  const sourcePath = mcpPath ?? candidatePaths[0]!;

  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(mcpContent) as Record<string, unknown>;
  } catch {
    // skip malformed
  }
  const mcpServersRaw = parsed?.mcpServers;
  if (
    mcpServersRaw !== undefined &&
    typeof mcpServersRaw === 'object' &&
    mcpServersRaw !== null &&
    Object.keys(mcpServersRaw).length > 0
  ) {
    const mcpServers: Record<string, McpServer> = {};
    for (const [n, val] of Object.entries(mcpServersRaw)) {
      const server = mapClineServerToCanonical(val);
      if (server) mcpServers[n] = server;
    }
    if (Object.keys(mcpServers).length > 0) {
      await mkdirp(join(projectRoot, '.agentsmesh'));
      await writeFileAtomic(join(projectRoot, AB_MCP), JSON.stringify({ mcpServers }, null, 2));
      results.push({
        fromTool: CLINE_TARGET,
        fromPath: sourcePath,
        toPath: AB_MCP,
        feature: 'mcp',
      });
    }
  }
}
