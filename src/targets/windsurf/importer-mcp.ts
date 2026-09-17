import { AB_MCP } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import {
  WINDSURF_TARGET,
  WINDSURF_MCP_EXAMPLE_FILE,
  WINDSURF_MCP_CONFIG_FILE,
} from './constants.js';

export async function importWindsurfMcp(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const sourceCandidates = [WINDSURF_MCP_EXAMPLE_FILE, WINDSURF_MCP_CONFIG_FILE];
  for (const relPath of sourceCandidates) {
    const srcPath = join(projectRoot, relPath);
    const content = await readFileSafe(srcPath);
    if (!content) continue;
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') continue;
      const destPath = join(projectRoot, AB_MCP);
      await mkdirp(dirname(destPath));
      await writeFileAtomic(destPath, JSON.stringify({ mcpServers: parsed.mcpServers }, null, 2));
      results.push({
        fromTool: WINDSURF_TARGET,
        fromPath: srcPath,
        toPath: AB_MCP,
        feature: 'mcp',
      });
      return;
    } catch {
      // Invalid MCP JSON should not fail import.
    }
  }
}
