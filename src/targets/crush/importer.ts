/**
 * Import Crush config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `CRUSH.md`         — root rule
 *   - `.crush/skills/`   — skill bundles
 *   - `crush.json`       — MCP servers (`mcp` key), hooks (`hooks` key),
 *                          permissions (`permissions` key)
 *   - `.crushignore`     — ignore patterns
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ImportResult, McpServer } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { toStringArray, toStringRecord } from '../import/shared-import-helpers.js';
import type { HookEntry } from '../../core/hook-types.js';
import { descriptor } from './index.js';
import {
  CRUSH_TARGET,
  CRUSH_SKILLS_DIR,
  CRUSH_GLOBAL_SKILLS_DIR,
  CRUSH_CONFIG_FILE,
  CRUSH_GLOBAL_CONFIG_FILE,
} from './constants.js';

export async function importFromCrush(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? CRUSH_GLOBAL_SKILLS_DIR : CRUSH_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, CRUSH_TARGET, results, normalize);

  await importCrushConfigJson(projectRoot, scope, results);

  return results;
}

/**
 * Parse crush.json and import MCP servers, hooks, and permissions into canonical files.
 * Crush stores MCP under `mcp` key (not `mcpServers`), hooks under `hooks`, and
 * permissions under `permissions`.
 */
async function importCrushConfigJson(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
): Promise<void> {
  // Crush's global config lives at ~/.config/crush/crush.json (projectRoot = homedir in global scope).
  const configRel = scope === 'global' ? CRUSH_GLOBAL_CONFIG_FILE : CRUSH_CONFIG_FILE;
  const configPath = join(projectRoot, configRel);
  const content = await readFileSafe(configPath);
  if (content === null) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  const config = parsed as Record<string, unknown>;

  // Import MCP servers from `mcp` key
  const mcpServers = parseCrushMcpServers(config['mcp']);
  if (Object.keys(mcpServers).length > 0) {
    const canonicalPath = AB_MCP;
    const destPath = join(projectRoot, canonicalPath);
    await mkdirp(dirname(destPath));
    await writeFileAtomic(destPath, JSON.stringify({ mcpServers }, null, 2));
    results.push({
      fromTool: CRUSH_TARGET,
      fromPath: configPath,
      toPath: canonicalPath,
      feature: 'mcp',
    });
  }

  // Import hooks from `hooks` key
  const hooks = parseCrushHooks(config['hooks']);
  if (hooks !== null && Object.keys(hooks).length > 0) {
    const canonicalPath = '.agentsmesh/hooks.yaml';
    const destPath = join(projectRoot, canonicalPath);
    await mkdirp(dirname(destPath));
    const hooksContent = serializeHooksYaml(hooks);
    await writeFileAtomic(destPath, hooksContent);
    results.push({
      fromTool: CRUSH_TARGET,
      fromPath: configPath,
      toPath: canonicalPath,
      feature: 'hooks',
    });
  }

  // Import permissions from `permissions.allowed_tools` (allow) and `options.disabled_tools` (deny)
  const permissions = parseCrushPermissions(config['permissions'], config['options']);
  if (permissions !== null) {
    const canonicalPath = '.agentsmesh/permissions.yaml';
    const destPath = join(projectRoot, canonicalPath);
    await mkdirp(dirname(destPath));
    await writeFileAtomic(destPath, stringifyYaml(permissions));
    results.push({
      fromTool: CRUSH_TARGET,
      fromPath: configPath,
      toPath: canonicalPath,
      feature: 'permissions',
    });
  }
}

interface CrushPermissions {
  allow: string[];
  deny: string[];
}

/**
 * Parse crush.json permissions.allowed_tools (allow list) and
 * options.disabled_tools (deny list) into canonical form.
 * Returns null when both lists are empty or absent.
 */
function parseCrushPermissions(
  rawPermissions: unknown,
  rawOptions: unknown,
): CrushPermissions | null {
  const allow =
    rawPermissions !== null && typeof rawPermissions === 'object' && !Array.isArray(rawPermissions)
      ? toStringArray((rawPermissions as Record<string, unknown>)['allowed_tools'])
      : [];
  const deny =
    rawOptions !== null && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
      ? toStringArray((rawOptions as Record<string, unknown>)['disabled_tools'])
      : [];
  if (allow.length === 0 && deny.length === 0) return null;
  return { allow, deny };
}

function parseCrushMcpServers(raw: unknown): Record<string, McpServer> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, McpServer> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const server = value as Record<string, unknown>;
    const description =
      typeof server['description'] === 'string' ? server['description'] : undefined;
    if (typeof server['command'] === 'string') {
      out[name] = {
        type: typeof server['type'] === 'string' ? server['type'] : 'stdio',
        command: server['command'],
        args: toStringArray(server['args']),
        env: toStringRecord(server['env']),
        ...(description !== undefined ? { description } : {}),
      };
      continue;
    }
    if (typeof server['url'] === 'string') {
      out[name] = {
        type: typeof server['type'] === 'string' ? server['type'] : 'http',
        url: server['url'],
        headers: toStringRecord(server['headers']),
        env: toStringRecord(server['env']),
        ...(description !== undefined ? { description } : {}),
      };
    }
  }
  return out;
}

function parseCrushHooks(raw: unknown): Record<string, HookEntry[]> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, HookEntry[]> = {};
  for (const [event, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    const items: HookEntry[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      const command = typeof e['command'] === 'string' ? e['command'].trim() : '';
      if (!command) continue;
      const matcher = typeof e['matcher'] === 'string' ? e['matcher'] : '';
      const item: HookEntry = { matcher, command };
      if (typeof e['timeout'] === 'number') item.timeout = e['timeout'];
      items.push(item);
    }
    if (items.length > 0) out[event] = items;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function serializeHooksYaml(hooks: Record<string, HookEntry[]>): string {
  const lines: string[] = [];
  for (const [event, entries] of Object.entries(hooks)) {
    lines.push(`${event}:`);
    for (const entry of entries) {
      lines.push(`  - matcher: ${JSON.stringify(entry.matcher)}`);
      lines.push(`    command: ${JSON.stringify(entry.command)}`);
      if (entry.timeout !== undefined) {
        lines.push(`    timeout: ${entry.timeout}`);
      }
    }
  }
  return lines.join('\n');
}
