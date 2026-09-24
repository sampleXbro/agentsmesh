/**
 * Merge imported MCP servers into the canonical `.agentsmesh/mcp.json` file.
 *
 * Sequential `agentsmesh import --from <target>` runs accumulate servers by name:
 * existing canonical entries are preserved, and the imported set wins on name collision.
 */

import { dirname, join } from 'node:path';
import type { McpServer } from '../../core/types.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';

export async function writeMcpWithMerge(
  projectRoot: string,
  canonicalPath: string,
  imported: Record<string, McpServer>,
): Promise<void> {
  const destPath = join(projectRoot, canonicalPath);
  const existing = parseMcpServers(await readFileSafe(destPath));
  const merged: Record<string, McpServer> = { ...existing, ...imported };
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, JSON.stringify({ mcpServers: merged }, null, 2));
}

/** Servers in canonical mcp.json text; `{}` when it is missing or not valid. */
export function parseMcpServers(content: string | null): Record<string, McpServer> {
  if (content === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const raw = (parsed as Record<string, unknown>).mcpServers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, McpServer> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    out[name] = value as McpServer;
  }
  return out;
}
