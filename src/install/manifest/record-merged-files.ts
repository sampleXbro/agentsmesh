/**
 * Keep a pack's install manifest current after a merge writes into the pack.
 *
 * The files the merge wrote get their new hashes. Every other entry keeps its
 * install-time hash, so edits, additions and deletions the user made before
 * the merge still show as drift to refresh and uninstall.
 */

import { join, relative } from 'node:path';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { hashPackFiles, INSTALL_MANIFEST_FILENAME } from './install-manifest-hash.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Record the merge-written files (absolute paths inside `packDir`) in the
 * pack's manifest. A missing manifest (legacy pack) or one without a `files`
 * map is left alone: uninstall's legacy migration owns that baseline.
 */
export async function recordMergedFiles(
  packDir: string,
  writtenPaths: readonly string[],
): Promise<void> {
  const manifestPath = join(packDir, INSTALL_MANIFEST_FILENAME);
  const raw = await readFileSafe(manifestPath);
  const manifest = raw === null ? undefined : parseJson(raw);
  if (!isRecord(manifest) || !isRecord(manifest.files)) return;

  const written = new Set(writtenPaths.map((abs) => relative(packDir, abs).replaceAll('\\', '/')));
  const fresh = Object.entries(await hashPackFiles(packDir)).filter(([rel]) => written.has(rel));
  const files = Object.entries({ ...manifest.files, ...Object.fromEntries(fresh) }).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  await writeFileAtomic(
    manifestPath,
    `${JSON.stringify({ ...manifest, files: Object.fromEntries(files) }, null, 2)}\n`,
  );
}
