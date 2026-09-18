/**
 * Import Warp config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `WARP.md` / `AGENTS.md`   — root rule (legacy WARP.md takes priority)
 *   - `~/.agents/AGENTS.md`     — machine-wide root rule (global scope)
 *   - `.warp/skills/`           — skill bundles
 *   - `.warp/.mcp.json`         — MCP servers (standard format, project scope)
 *   - `~/.warp/.mcp.json`       — MCP servers (standard format, global scope)
 *   - `.warpindexingignore`     — indexing exclusions (project scope)
 *   - `~/.warp/settings.toml`   — agent permissions (global scope only; its
 *     `[agents.profiles]` keys need bespoke parsing, so it is imperative —
 *     see `global-permissions.ts`)
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { importWarpGlobalPermissions } from './global-permissions.js';
import { WARP_TARGET, WARP_SKILLS_DIR, WARP_GLOBAL_SKILLS_DIR } from './constants.js';
import { descriptor } from './index.js';

export async function importFromWarp(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? WARP_GLOBAL_SKILLS_DIR : WARP_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, WARP_TARGET, results, normalize);

  if (scope === 'global') {
    await importWarpGlobalPermissions(projectRoot, results);
  }

  return results;
}
