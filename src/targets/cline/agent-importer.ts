/**
 * Import Cline agents from `.cline/agents.yaml` (combined file — the CLI-
 * documented primary surface) back into canonical `.agentsmesh/agents/<name>.md`
 * files.
 *
 * Falls back to the legacy `.cline/agents/<name>.md` directory format when
 * agents.yaml is absent (backward compatibility with the undocumented per-file
 * layout that some earlier agentsmesh versions generated).
 */

import { AB_AGENTS } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedAgentWithFallback } from '../import/import-metadata.js';
import { CLINE_TARGET, CLINE_AGENTS_DIR, CLINE_AGENTS_FILE } from './constants.js';
import { importFileDirectory } from '../import/import-orchestrator.js';

type Normalize = (content: string, sourceFile: string, destinationFile: string) => string;

const EXTENSION_KEYS: Record<string, string> = {
  'x-agentsmesh-disallowed-tools': 'disallowedTools',
  'x-agentsmesh-permission-mode': 'permissionMode',
  'x-agentsmesh-max-turns': 'maxTurns',
  'x-agentsmesh-mcp-servers': 'mcpServers',
  'x-agentsmesh-hooks': 'hooks',
  'x-agentsmesh-skills': 'skills',
  'x-agentsmesh-memory': 'memory',
};

function toCanonicalFrontmatter(entry: Record<string, unknown>): Record<string, unknown> {
  const canonicalFrontmatter: Record<string, unknown> = {
    name: entry.name,
    description: typeof entry.description === 'string' ? entry.description : undefined,
    model: typeof entry.model === 'string' ? entry.model : undefined,
    tools: Array.isArray(entry.tools) ? entry.tools : undefined,
  };
  for (const [extensionKey, canonicalKey] of Object.entries(EXTENSION_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(entry, extensionKey)) {
      canonicalFrontmatter[canonicalKey] = entry[extensionKey];
    }
  }
  Object.keys(canonicalFrontmatter).forEach((key) => {
    if (canonicalFrontmatter[key] === undefined) delete canonicalFrontmatter[key];
  });
  return canonicalFrontmatter;
}

/**
 * Primary: import from `.cline/agents.yaml` combined file (CLI-documented surface).
 *
 * @returns true if the file existed and contained agents; false otherwise
 */
async function importClineAgentsYaml(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
): Promise<boolean> {
  const srcPath = join(projectRoot, CLINE_AGENTS_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return false;

  let parsed: unknown;
  try {
    parsed = yamlParse(content);
  } catch {
    return false;
  }
  const list = (parsed as { agents?: unknown } | null)?.agents;
  if (!Array.isArray(list) || list.length === 0) return false;

  const destDir = join(projectRoot, AB_AGENTS);
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' && record.name ? record.name : null;
    if (!name) continue;

    const destPath = join(destDir, `${name}.md`);
    const body = typeof record.prompt === 'string' ? record.prompt : '';
    const fileContent = await serializeImportedAgentWithFallback(
      destPath,
      toCanonicalFrontmatter(record),
      normalize(body, srcPath, destPath),
    );
    await mkdirp(destDir);
    await writeFileAtomic(destPath, fileContent);
    results.push({
      fromTool: CLINE_TARGET,
      fromPath: srcPath,
      toPath: `${AB_AGENTS}/${name}.md`,
      feature: 'agents',
    });
  }
  return true;
}

/**
 * Fallback: import from `.cline/agents/<name>.md` directory of Markdown files.
 * Used only when `.cline/agents.yaml` is absent (backward compatibility with
 * the undocumented per-file directory layout).
 */
async function importClineAgentsDirectory(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
): Promise<void> {
  const srcDir = join(projectRoot, CLINE_AGENTS_DIR);
  const destDir = join(projectRoot, AB_AGENTS);
  const imported = await importFileDirectory({
    srcDir,
    destDir,
    extensions: ['.md'],
    fromTool: CLINE_TARGET,
    normalize,
    mapEntry: async ({ relativePath, normalizeTo }) => {
      const destPath = join(destDir, relativePath);
      const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
      return {
        destPath,
        toPath: `${AB_AGENTS}/${relativePath}`,
        feature: 'agents',
        content: await serializeImportedAgentWithFallback(destPath, frontmatter, body),
      };
    },
  });
  results.push(...imported);
}

/**
 * Import Cline agents: tries the primary `.cline/agents.yaml` first; falls
 * back to the legacy `.cline/agents/<name>.md` directory format when absent.
 *
 * @param projectRoot - Project root directory
 * @param results - Import results accumulator
 * @param normalize - Reference normalizer for cross-file link rewriting
 */
export async function importClineAgents(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
): Promise<void> {
  const found = await importClineAgentsYaml(projectRoot, results, normalize);
  if (!found) {
    await importClineAgentsDirectory(projectRoot, results, normalize);
  }
}
