/**
 * Global-scope MCP support for Copilot CLI: `~/.copilot/mcp-config.json`,
 * top-level `mcpServers` key (docs.github.com/en/copilot/how-tos/copilot-cli/
 * customize-copilot/add-mcp-servers) — distinct from the project-scope
 * `.vscode/mcp.json` `servers` key, so this is wired independently of
 * `generateMcp`/`importFromCopilot`'s declarative `mcp` spec rather than
 * reusing either (see `scope-extras.ts`, gated on `scope === 'global'`).
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { CanonicalFiles, GenerateResult, ImportResult, McpServer } from '../../core/types.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { writeMcpWithMerge } from '../import/mcp-merge.js';
import { COPILOT_TARGET, COPILOT_GLOBAL_MCP } from './constants.js';

function computeStatus(existing: string | null, content: string): GenerateResult['status'] {
  if (existing === null) return 'created';
  if (existing !== content) return 'updated';
  return 'unchanged';
}

/** Emits ~/.copilot/mcp-config.json from canonical MCP servers in global scope. */
export async function generateCopilotGlobalMcp(
  canonical: CanonicalFiles,
  projectRoot: string,
): Promise<GenerateResult[]> {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  const content = JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2);
  const existing = await readFileSafe(join(projectRoot, COPILOT_GLOBAL_MCP));
  return [
    {
      target: COPILOT_TARGET,
      path: COPILOT_GLOBAL_MCP,
      content,
      currentContent: existing ?? undefined,
      status: computeStatus(existing, content),
    },
  ];
}

/** Imports ~/.copilot/mcp-config.json (`mcpServers` key) into canonical mcp.json. */
export async function importCopilotGlobalMcp(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, COPILOT_GLOBAL_MCP);
  const content = await readFileSafe(srcPath);
  if (!content) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const rawServers = (parsed as Record<string, unknown>).mcpServers;
  if (!rawServers || typeof rawServers !== 'object' || Array.isArray(rawServers)) return;

  const mcpServers: Record<string, McpServer> = {};
  for (const [name, value] of Object.entries(rawServers as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    mcpServers[name] = value as McpServer;
  }
  if (Object.keys(mcpServers).length === 0) return;

  await writeMcpWithMerge(projectRoot, AB_MCP, mcpServers);
  results.push({
    fromTool: COPILOT_TARGET,
    fromPath: srcPath,
    toPath: AB_MCP,
    feature: 'mcp',
  });
}
