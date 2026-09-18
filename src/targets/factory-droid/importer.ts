/**
 * Import Factory Droid config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `AGENTS.md`          — root rule
 *   - `.factory/commands/` — native slash commands → canonical commands
 *   - `.factory/droids/`   — native droid definitions → canonical agents
 *   - `.factory/skills/`   — skill bundles
 *   - `.factory/mcp.json`  — MCP servers
 *   - `.factory/hooks.json` `hooks` key — wrapped command hooks → canonical hooks.yaml
 *   - `.factory/settings.json` — commandAllowlist/commandDenylist → canonical permissions.yaml
 */

import { AB_HOOKS, AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { importWrappedCommandHooks } from '../import/wrapped-command-hooks.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { importFactoryDroidMcp } from './mcp-import.js';
import {
  FACTORY_DROID_TARGET,
  FACTORY_DROID_SKILLS_DIR,
  FACTORY_DROID_MCP_FILE,
  FACTORY_DROID_HOOKS_FILE,
  FACTORY_DROID_SETTINGS_FILE,
  FACTORY_DROID_GLOBAL_SKILLS_DIR,
  FACTORY_DROID_GLOBAL_MCP_FILE,
} from './constants.js';
import { descriptor } from './index.js';

async function importFactoryDroidPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const settingsPath = join(projectRoot, FACTORY_DROID_SETTINGS_FILE);
  const content = await readFileSafe(settingsPath);
  if (!content) return;
  let parsed: Record<string, unknown>;
  try {
    const p: unknown = JSON.parse(content);
    if (p === null || typeof p !== 'object' || Array.isArray(p)) return;
    parsed = p as Record<string, unknown>;
  } catch {
    return;
  }
  const allow = Array.isArray(parsed.commandAllowlist)
    ? (parsed.commandAllowlist as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const deny = Array.isArray(parsed.commandDenylist)
    ? (parsed.commandDenylist as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  if (allow.length === 0 && deny.length === 0) return;
  const canonical: Record<string, string[]> = {};
  if (allow.length > 0) canonical.allow = allow;
  if (deny.length > 0) canonical.deny = deny;
  const destPath = join(projectRoot, AB_PERMISSIONS);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, yamlStringify(canonical));
  results.push({
    fromTool: FACTORY_DROID_TARGET,
    fromPath: settingsPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}

export async function importFromFactoryDroid(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? FACTORY_DROID_GLOBAL_SKILLS_DIR : FACTORY_DROID_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, FACTORY_DROID_TARGET, results, normalize);

  const mcpFile = scope === 'global' ? FACTORY_DROID_GLOBAL_MCP_FILE : FACTORY_DROID_MCP_FILE;
  await importFactoryDroidMcp(projectRoot, mcpFile, results);

  // Hooks live under the `hooks` key in `.factory/hooks.json` (primary surface
  // per docs.factory.ai/reference/hooks-reference).
  await importWrappedCommandHooks({
    projectRoot,
    hooksFile: FACTORY_DROID_HOOKS_FILE,
    canonicalHooksPath: AB_HOOKS,
    targetName: FACTORY_DROID_TARGET,
    results,
  });

  // Permissions live in `.factory/settings.json` (commandAllowlist / commandDenylist).
  await importFactoryDroidPermissions(projectRoot, results);

  return results;
}
