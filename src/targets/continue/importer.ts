import { AB_MCP, AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { dirname, extname, join } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import type { ImportResult, McpServer } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import {
  mkdirp,
  readDirRecursiveNoSymlinks,
  readFileSafe,
  writeFileAtomic,
} from '../../utils/filesystem/fs.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { writeMcpWithMerge } from '../import/mcp-merge.js';
import { toStringArray, toStringRecord } from '../import/shared-import-helpers.js';
import {
  CONTINUE_TARGET,
  CONTINUE_MCP_DIR,
  CONTINUE_SKILLS_DIR,
  CONTINUE_GLOBAL_PERMISSIONS,
} from './constants.js';
import { parseContinuePermissions } from './permissions.js';
import { importContinueHooks } from './hooks.js';
import { descriptor } from './index.js';

function readMcpServers(content: string, extension: string): Record<string, McpServer> {
  const parsed =
    extension === '.json'
      ? (JSON.parse(content) as Record<string, unknown>)
      : ((parseYaml(content) as Record<string, unknown>) ?? {});
  const rawServers = parsed.mcpServers;
  if (!rawServers || typeof rawServers !== 'object' || Array.isArray(rawServers)) return {};
  const servers: Record<string, McpServer> = {};
  for (const [name, value] of Object.entries(rawServers)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const server = value as Record<string, unknown>;
    const description = typeof server.description === 'string' ? server.description : undefined;
    if (typeof server.command === 'string') {
      servers[name] = {
        type: typeof server.type === 'string' ? server.type : 'stdio',
        command: server.command,
        args: toStringArray(server.args),
        env: toStringRecord(server.env),
        description,
      };
      continue;
    }
    // URL/HTTP/SSE servers (no command). Without this branch a generate ->
    // re-import round-trip through Continue silently drops every remote server,
    // mirroring the cline bug — Continue's generator emits url servers verbatim.
    if (typeof server.url === 'string') {
      servers[name] = {
        type: typeof server.type === 'string' ? server.type : 'http',
        url: server.url,
        headers: toStringRecord(server.headers),
        env: toStringRecord(server.env),
        description,
      };
    }
  }
  return servers;
}

/**
 * Continue MCP merges every JSON/YAML file under `.continue/mcpServers/` into a
 * single canonical `mcp.json`. The descriptor runner does not model multi-file
 * merge today, so this stays imperative.
 */
async function importMcp(projectRoot: string, results: ImportResult[]): Promise<void> {
  const files = (await readDirRecursiveNoSymlinks(join(projectRoot, CONTINUE_MCP_DIR))).filter(
    (file) => ['.json', '.yaml', '.yml'].includes(extname(file)),
  );
  const merged: Record<string, McpServer> = {};
  const importedFrom: string[] = [];
  for (const srcPath of files) {
    const content = await readFileSafe(srcPath);
    if (!content) continue;
    Object.assign(merged, readMcpServers(content, extname(srcPath)));
    importedFrom.push(srcPath);
  }
  if (Object.keys(merged).length === 0) return;
  await writeMcpWithMerge(projectRoot, AB_MCP, merged);
  for (const fromPath of importedFrom) {
    results.push({
      fromTool: CONTINUE_TARGET,
      fromPath,
      toPath: AB_MCP,
      feature: 'mcp',
    });
  }
}

/**
 * Continue reads personal tool permissions only at the global tier
 * (`~/.continue/permissions.yaml`), so this import is gated to global scope.
 */
async function importPermissions(projectRoot: string, results: ImportResult[]): Promise<void> {
  const srcPath = join(projectRoot, CONTINUE_GLOBAL_PERMISSIONS);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  const permissions = parseContinuePermissions(content);
  if (!permissions) return;
  const destPath = join(projectRoot, AB_PERMISSIONS);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, stringifyYaml(permissions).trimEnd() + '\n');
  results.push({
    fromTool: CONTINUE_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}

export async function importFromContinue(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);
  await importEmbeddedSkills(projectRoot, CONTINUE_SKILLS_DIR, CONTINUE_TARGET, results, normalize);
  await importMcp(projectRoot, results);
  await importContinueHooks(projectRoot, results);
  if (scope === 'global') await importPermissions(projectRoot, results);
  return results;
}
