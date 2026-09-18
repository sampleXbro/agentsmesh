/**
 * Imports Amazon Q agent `toolsSettings` deniedPaths back into `.agentsmesh/ignore`.
 *
 * The descriptor importer maps one source file to one canonical file, but ignore
 * patterns are spread across every agent JSON in the scope's agents directory, so
 * this imperative pass unions them (first-seen order) into the single canonical
 * ignore file — the same shape as the Claude Code settings.json pass.
 *
 * Unioning flattens Amazon Q's per-agent deny scope; canonical ignore has no per-agent
 * dimension, so `lintIgnore` warns that the union is written back to every agent.
 *
 * The union is merged into the canonical file rather than written over it, so comments
 * and negations the generator had to drop survive the round trip (mergeCanonicalIgnore).
 *
 * `allowedPaths` and other tool settings have no canonical home and are not imported.
 */

import { AB_IGNORE } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import {
  readDirRecursive,
  readFileSafe,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { AQ_DENIED_PATH_TOOLS } from './agent-json.js';
import { mergeCanonicalIgnore } from './merge-canonical-ignore.js';
import { AMAZON_Q_TARGET, AMAZON_Q_AGENTS_DIR, AMAZON_Q_GLOBAL_AGENTS_DIR } from './constants.js';

function deniedPathsOf(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const settings = (parsed as Record<string, unknown>).toolsSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return [];

  const found: string[] = [];
  for (const tool of AQ_DENIED_PATH_TOOLS) {
    const entry = (settings as Record<string, unknown>)[tool];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const denied = (entry as Record<string, unknown>).deniedPaths;
    if (!Array.isArray(denied)) continue;
    found.push(...denied.filter((p): p is string => typeof p === 'string'));
  }
  return found;
}

export async function importAmazonQToolsSettings(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
): Promise<void> {
  const agentsDir = scope === 'global' ? AMAZON_Q_GLOBAL_AGENTS_DIR : AMAZON_Q_AGENTS_DIR;
  const files = (await readDirRecursive(join(projectRoot, agentsDir)))
    .filter((file) => file.endsWith('.json'))
    .sort();

  const patterns = new Set<string>();
  const sources: string[] = [];
  for (const file of files) {
    const content = await readFileSafe(file);
    if (content === null) continue;
    const denied = deniedPathsOf(content);
    if (denied.length === 0) continue;
    for (const pattern of denied) patterns.add(pattern);
    sources.push(file);
  }
  if (patterns.size === 0) return;

  const destPath = join(projectRoot, AB_IGNORE);
  await mkdirp(dirname(destPath));
  const existing = await readFileSafe(destPath);
  await writeFileAtomic(destPath, mergeCanonicalIgnore(existing, [...patterns]));
  for (const fromPath of sources) {
    results.push({
      fromTool: AMAZON_Q_TARGET,
      fromPath,
      toPath: AB_IGNORE,
      feature: 'ignore',
    });
  }
}
