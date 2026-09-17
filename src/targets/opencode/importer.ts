/**
 * Import OpenCode config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `AGENTS.md`                    — root rule
 *   - `.opencode/rules/*.md`         — additional rules
 *   - `.opencode/commands/*.md`      — slash commands
 *   - `.opencode/agents/*.md`        — custom agents
 *   - `.opencode/skills/`            — skill bundles
 *   - `opencode.json`               — MCP servers from `mcp` key
 *
 * MCP import is custom because OpenCode uses `mcp` (not `mcpServers`)
 * and a different server format (array `command`, `environment` key).
 */

import { AB_IGNORE, AB_MCP, AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { McpServer } from '../../core/mcp-types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { writeMcpWithMerge } from '../import/mcp-merge.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { mkdirp, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { stringify as stringifyYaml } from 'yaml';
import {
  OPENCODE_TARGET,
  OPENCODE_SKILLS_DIR,
  OPENCODE_CONFIG_FILE,
  OPENCODE_GLOBAL_CONFIG_FILE,
} from './constants.js';
import { mapOpenCodePermissionToIgnore } from './ignore-map.js';
import { descriptor } from './index.js';

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function parseOpenCodeMcp(content: string): Record<string, McpServer> {
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
    if (typeof entry.url === 'string') {
      out[name] = {
        type: 'url',
        url: entry.url,
        headers: toStringRecord(entry.headers),
        env: toStringRecord(entry.environment),
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      };
      continue;
    }
    if (Array.isArray(entry.command) && entry.command.length > 0) {
      const cmdArr = entry.command as string[];
      const command = cmdArr[0];
      if (command === undefined) continue;
      const args = cmdArr.slice(1);
      out[name] = {
        type: 'stdio',
        command,
        args,
        env: toStringRecord(entry.environment),
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      };
    }
  }
  return out;
}

async function importMcp(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
): Promise<void> {
  const configFile = scope === 'global' ? OPENCODE_GLOBAL_CONFIG_FILE : OPENCODE_CONFIG_FILE;
  const srcPath = join(projectRoot, configFile);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  const imported = parseOpenCodeMcp(content);
  if (Object.keys(imported).length === 0) return;
  await writeMcpWithMerge(projectRoot, AB_MCP, imported);
  results.push({
    feature: 'mcp',
    fromTool: OPENCODE_TARGET,
    fromPath: srcPath,
    toPath: AB_MCP,
  });
}

async function importPermissions(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
): Promise<void> {
  const configFile = scope === 'global' ? OPENCODE_GLOBAL_CONFIG_FILE : OPENCODE_CONFIG_FILE;
  const srcPath = join(projectRoot, configFile);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const permission = (parsed as Record<string, unknown>).permission;
  if (!permission || typeof permission !== 'object' || Array.isArray(permission)) return;
  const canonical = { allow: [] as string[], ask: [] as string[], deny: [] as string[] };
  for (const [name, rule] of Object.entries(permission)) {
    // A tool whose rules were folded into the object form keeps its blanket action
    // under the `"*"` catch-all; without one, the globs belong to ignore, not permissions.
    const level =
      typeof rule === 'string'
        ? rule
        : rule && typeof rule === 'object' && !Array.isArray(rule)
          ? (rule as Record<string, unknown>)['*']
          : undefined;
    if (level === 'allow') canonical.allow.push(name);
    if (level === 'ask') canonical.ask.push(name);
    if (level === 'deny') canonical.deny.push(name);
  }
  if (canonical.allow.length + canonical.ask.length + canonical.deny.length === 0) return;
  const destPath = join(projectRoot, AB_PERMISSIONS);
  await mkdirp(join(projectRoot, '.agentsmesh'));
  await writeFileAtomic(destPath, stringifyYaml(canonical));
  results.push({
    feature: 'permissions',
    fromTool: OPENCODE_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
  });
}

async function importIgnore(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
): Promise<void> {
  const configFile = scope === 'global' ? OPENCODE_GLOBAL_CONFIG_FILE : OPENCODE_CONFIG_FILE;
  const srcPath = join(projectRoot, configFile);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const patterns = mapOpenCodePermissionToIgnore((parsed as Record<string, unknown>).permission);
  if (patterns.length === 0) return;
  await mkdirp(join(projectRoot, '.agentsmesh'));
  await writeFileAtomic(join(projectRoot, AB_IGNORE), `${patterns.join('\n')}\n`);
  results.push({
    feature: 'ignore',
    fromTool: OPENCODE_TARGET,
    fromPath: srcPath,
    toPath: AB_IGNORE,
  });
}

export async function importFromOpenCode(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  await importEmbeddedSkills(projectRoot, OPENCODE_SKILLS_DIR, OPENCODE_TARGET, results, normalize);

  await importMcp(projectRoot, scope, results);
  await importPermissions(projectRoot, scope, results);
  await importIgnore(projectRoot, scope, results);

  return results;
}
