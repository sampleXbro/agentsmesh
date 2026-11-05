/**
 * Per-file SHA-256 hashing for the install-time integrity manifest.
 *
 * Produces the `files` map written to `.agentsmesh-install-manifest.json`
 * alongside the pack at install time (a later merge into the pack updates
 * the entries of the files it writes, see `record-merged-files.ts`).
 * Uninstall and refresh re-hash the same files and compare against this map
 * to surface user modifications before deleting or overwriting a pack.
 *
 * The aggregate `pack.yaml` `content_hash` (computed by `pack-hash.ts`)
 * fingerprints the whole pack as one string for tamper detection. This
 * helper is complementary: it exposes the same evidence one file at a time,
 * so modification reports can name specific files.
 *
 * `pack.yaml` and the manifest file itself are excluded from the map so
 * metadata churn never registers as content drift.
 */

import { relative } from 'node:path';
import { z } from 'zod';
import { readDirRecursiveNoSymlinks } from '../../utils/filesystem/fs.js';
import { hashFileForManifest } from '../../utils/crypto/hash.js';

export const INSTALL_MANIFEST_FILENAME = '.agentsmesh-install-manifest.json';

const EXCLUDED_FILENAMES: readonly string[] = ['pack.yaml', INSTALL_MANIFEST_FILENAME];

/**
 * Structural schema for `.agentsmesh-install-manifest.json` — the per-pack
 * integrity manifest written by `pack-writer.ts::writeInstallManifest` next
 * to every installed pack.
 *
 * Used by the JSON Schema generator to publish `schemas/install-manifest.json`
 * for editor autocomplete and CI validation. Runtime parsing currently goes
 * through `JSON.parse` plus narrow field-by-field reads (see
 * `uninstall-decisions.ts::readManifestFiles` and
 * `installs-list.ts::readPackManifestMeta`), which remain forgiving of
 * legacy/partial manifests.
 *
 * Field reference (mirrors `pack-writer.ts`):
 *   - `name`         — pack name; matches the parent directory under `.agentsmesh/packs/`.
 *   - `source`       — pinned install source (e.g. `github:org/repo@sha`).
 *   - `installed_at` — ISO 8601 timestamp.
 *   - `extends_id`   — currently always `null`; reserved for future `--extends` provenance.
 *   - `source_type`  — classifier verdict at install time; `null` for legacy packs.
 *   - `files`        — forward-slash-relative-path → `"sha256:<64-hex>"` map,
 *                      excluding `pack.yaml` and the manifest itself.
 */
export const installManifestFileSchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  installed_at: z.string().min(1),
  extends_id: z.string().nullable(),
  source_type: z
    .enum(['anthropic-skill-pack', 'canonical-agentsmesh', 'tool-native', 'unknown'])
    .nullable(),
  files: z.record(z.string().min(1), z.string().regex(/^sha256:[0-9a-f]{64}$/)),
});

function toForwardSlashRelative(packDir: string, abs: string): string {
  return relative(packDir, abs).replaceAll('\\', '/');
}

/**
 * Compute a deterministic per-file hash map for everything under `packDir`,
 * excluding `pack.yaml` and `.agentsmesh-install-manifest.json`.
 *
 * Keys are forward-slash relative paths sorted ascending; values are
 * `sha256:<64-hex>` strings.
 */
export async function hashPackFiles(packDir: string): Promise<Record<string, string>> {
  // No-symlinks variant: a symlinked file inside a pack would let install
  // hash the resolved target (and silently absorb external bytes), then at
  // uninstall the recursive `rm` would only delete the link itself —
  // producing a permanent drift-detection mismatch. Skip symlinks so install
  // and uninstall see the exact same byte universe.
  const files = await readDirRecursiveNoSymlinks(packDir);
  const entries: Array<[string, string]> = [];

  for (const abs of files) {
    const rel = toForwardSlashRelative(packDir, abs);
    if (EXCLUDED_FILENAMES.includes(rel)) continue;
    const hex = await hashFileForManifest(abs);
    if (hex === null) continue;
    entries.push([rel, `sha256:${hex}`]);
  }

  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}
