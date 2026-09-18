/**
 * Read and search pack metadata from .agentsmesh/packs/.
 */

import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { readFileSafe, exists } from '../../utils/filesystem/fs.js';
import { packMetadataSchema, type PackMetadata } from './pack-schema.js';
import { parseRemoteSource } from '../../config/remote/remote-source.js';

/** Found pack result including its directory path. */
export interface FoundPack {
  meta: PackMetadata;
  packDir: string;
  name: string;
}

export interface PackLookupScope {
  path?: string;
  target?: PackMetadata['target'];
  as?: PackMetadata['as'];
  features?: PackMetadata['features'];
}

function sourceIdentity(source: string): string {
  const parsed = parseRemoteSource(source);
  if (!parsed) return source.trim();

  if (parsed.kind === 'github') {
    return `github:${parsed.org}/${parsed.repo}`;
  }
  if (parsed.kind === 'gitlab') {
    return `gitlab:${parsed.namespace}/${parsed.project}`;
  }
  return `git+${parsed.url}`;
}

function sameFeatures(a: string[], b?: string[]): boolean {
  if (!b) return true;
  return a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');
}

/**
 * Read and validate pack.yaml from a pack directory.
 * Returns null if missing or invalid.
 */
export async function readPackMetadata(packDir: string): Promise<PackMetadata | null> {
  const metaPath = join(packDir, 'pack.yaml');
  const content = await readFileSafe(metaPath);
  if (content === null) return null;

  try {
    const raw = parseYaml(content) as unknown;
    return packMetadataSchema.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Scan packsDir for a pack whose source matches.
 * Returns the FoundPack or null if not found.
 */
export async function findExistingPack(
  packsDir: string,
  source: string,
  scope: PackLookupScope,
): Promise<FoundPack | null> {
  if (!(await exists(packsDir))) return null;
  const requestedIdentity = sourceIdentity(source);

  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packDir = join(packsDir, entry.name);
    const meta = await readPackMetadata(packDir);
    if (
      meta &&
      sourceIdentity(meta.source) === requestedIdentity &&
      meta.target === scope.target &&
      meta.as === scope.as &&
      sameFeatures(meta.features, scope.features)
    ) {
      return { meta, packDir, name: meta.name };
    }
  }
  return null;
}

/**
 * List all valid packs in packsDir.
 * Returns array of FoundPack for each valid pack directory.
 */
export async function listPacks(packsDir: string): Promise<FoundPack[]> {
  if (!(await exists(packsDir))) return [];

  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: FoundPack[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packDir = join(packsDir, entry.name);
    const meta = await readPackMetadata(packDir);
    if (meta) {
      result.push({ meta, packDir, name: meta.name });
    }
  }
  return result;
}
