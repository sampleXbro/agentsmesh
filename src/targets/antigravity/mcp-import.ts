/**
 * MCP import for both scopes.
 *
 * Kept out of the descriptor's shared `mcpJson` mode because that helper only
 * understands `url`, while Antigravity remote servers use `serverUrl`
 * (antigravity.google/docs/mcp/) and would be dropped. Merging still goes
 * through the shared `writeMcpWithMerge`, so servers other tools contributed to
 * `.agentsmesh/mcp.json` survive.
 *
 * `mcp_config.json` has no `type` or `description` key, so an entry parsed from
 * it carries a guessed `type` and no description. `writeMcpWithMerge` replaces
 * the whole canonical entry, so those two fields are carried over from the
 * canonical entry of the same name first — otherwise re-importing what
 * agentsmesh just generated would rewrite canonical `sse` to `http` and delete
 * every canonical description, corrupting the file for every other target.
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult, McpServer } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { parseMcp } from '../../canonical/features/mcp.js';
import { writeMcpWithMerge } from '../import/mcp-merge.js';
import { parseAntigravityMcpServers } from './mcp-format.js';
import {
  ANTIGRAVITY_TARGET,
  ANTIGRAVITY_GLOBAL_MCP_CONFIG,
  ANTIGRAVITY_MCP_CONFIG,
} from './constants.js';

/** Restores the two canonical fields the Antigravity file cannot hold. */
function carryOverCanonicalFields(existing: McpServer | undefined, imported: McpServer): McpServer {
  if (!existing) return imported;
  const sameKind = 'url' in existing === 'url' in imported;
  const type = sameKind ? existing.type : imported.type;
  const description = existing.description ?? imported.description;
  return { ...imported, type, ...(description !== undefined && { description }) };
}

export async function importAntigravityMcp(
  projectRoot: string,
  results: ImportResult[],
  scope: TargetLayoutScope,
): Promise<void> {
  const rel = scope === 'global' ? ANTIGRAVITY_GLOBAL_MCP_CONFIG : ANTIGRAVITY_MCP_CONFIG;
  const srcPath = join(projectRoot, rel);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const servers = parseAntigravityMcpServers(content);
  if (Object.keys(servers).length === 0) return;

  const canonical = await parseMcp(join(projectRoot, AB_MCP));
  const preserved: Record<string, McpServer> = {};
  for (const [name, server] of Object.entries(servers)) {
    preserved[name] = carryOverCanonicalFields(canonical?.mcpServers[name], server);
  }

  await writeMcpWithMerge(projectRoot, AB_MCP, preserved);
  results.push({
    fromTool: ANTIGRAVITY_TARGET,
    fromPath: srcPath,
    toPath: AB_MCP,
    feature: 'mcp',
  });
}
