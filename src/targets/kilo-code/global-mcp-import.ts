/**
 * Manual global-scope MCP import for Kilo Code.
 *
 * At global scope, MCP servers live under the `mcp` key inside the shared
 * `~/.config/kilo/kilo.jsonc` (kilo.ai/docs/automate/mcp/using-in-kilo-code)
 * — a different schema (`type: 'local'|'remote'`, array `command`,
 * `environment` key) than the project-scope `mcpServers` file the descriptor
 * importer's generic `mcpJson` mode expects. Read and transform it here,
 * mirroring the equivalent OpenCode import (same underlying config format).
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { McpServer } from '../../core/mcp-types.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { writeMcpWithMerge } from '../import/mcp-merge.js';
import { KILO_CODE_TARGET, KILO_GLOBAL_CONFIG_FILE } from './constants.js';

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}

function parseKiloGlobalMcp(content: string): Record<string, McpServer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const raw = (parsed as Record<string, unknown>).mcp;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: Record<string, McpServer> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const description = typeof entry.description === 'string' ? entry.description : undefined;

    if (typeof entry.url === 'string') {
      out[name] = {
        type: 'url',
        url: entry.url,
        headers: toStringRecord(entry.headers),
        env: toStringRecord(entry.environment),
        ...(description ? { description } : {}),
      };
      continue;
    }
    if (Array.isArray(entry.command) && entry.command.length > 0) {
      const [command, ...args] = entry.command as unknown[];
      if (typeof command !== 'string') continue;
      out[name] = {
        type: 'stdio',
        command,
        args: args.filter((a): a is string => typeof a === 'string'),
        env: toStringRecord(entry.environment),
        ...(description ? { description } : {}),
      };
    }
  }
  return out;
}

export async function importGlobalKiloMcp(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, KILO_GLOBAL_CONFIG_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  const imported = parseKiloGlobalMcp(content);
  if (Object.keys(imported).length === 0) return;
  await writeMcpWithMerge(projectRoot, AB_MCP, imported);
  results.push({
    feature: 'mcp',
    fromTool: KILO_CODE_TARGET,
    fromPath: srcPath,
    toPath: AB_MCP,
  });
}
