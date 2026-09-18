/**
 * Detection helpers for agentsmesh init command.
 */

import { join } from 'node:path';
import { exists } from '../../utils/filesystem/fs.js';
import type { ConfigScope } from '../../config/core/scope.js';
import { collectDetectionPaths } from '../../targets/catalog/detection.js';

function toolIndicators(scope: ConfigScope): Array<{ id: string; paths: string[] }> {
  const byId = new Map<string, string[]>();
  for (const { target, path } of collectDetectionPaths(scope)) {
    const prev = byId.get(target) ?? [];
    prev.push(path);
    byId.set(target, prev);
  }
  return [...byId.entries()].map(([id, paths]) => ({ id, paths }));
}

/**
 * Detect existing AI tool configs in the project.
 * @param projectRoot - Project root directory
 * @returns Array of tool IDs that have configs
 */
export async function detectExistingConfigs(
  projectRoot: string,
  scope: ConfigScope = 'project',
): Promise<string[]> {
  const found: string[] = [];
  for (const { id, paths } of toolIndicators(scope)) {
    for (const p of paths) {
      const full = join(projectRoot, p);
      if (await exists(full)) {
        found.push(id);
        break;
      }
    }
  }
  return [...new Set(found)];
}
