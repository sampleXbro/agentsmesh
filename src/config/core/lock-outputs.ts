/**
 * Generated-output checksum tracking for the lock file.
 *
 * `buildOutputChecksums` records the hash of every generated target output at
 * generate time; `diffOutputChecksums` compares those recorded hashes against
 * the files on disk so `agentsmesh check` can catch hand-edits to generated
 * artifacts (e.g. `AGENTS.md`, `.claude/**`).
 *
 * Invariant: the locked hash of an output MUST equal a re-hash of the exact
 * file `writeFileAtomic` produced. Because `writeFileAtomic` LF-normalizes text
 * payloads on write (`shouldNormalizeLineEndings`), the build side hashes the
 * same LF-normalized, BOM-stripped form for text paths — otherwise generator
 * content authored with CRLF would report false drift right after `generate`.
 * By the same token, a line-ending-only or BOM-only rewrite by a Windows editor
 * is deliberately NOT treated as drift. This is the identical contract used by
 * the install manifest via `hashFileForManifest`; the check side reuses it.
 */

import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hashFileForManifest } from '../../utils/crypto/hash.js';
import {
  UTF8_BOM,
  normalizeLineEndings,
  payloadEncodingFor,
  shouldNormalizeLineEndings,
} from '../../utils/filesystem/fs-text-encoding.js';
import type { GenerateResult } from '../../core/result-types.js';

/** Statuses whose content is materialized on disk and worth tracking. */
const TRACKED_STATUSES: ReadonlySet<GenerateResult['status']> = new Set([
  'created',
  'updated',
  'unchanged',
]);

/**
 * Hash generator content the way `writeFileAtomic` will store it: for text
 * paths, strip a leading UTF-8 BOM and normalize line endings to LF before
 * hashing; otherwise hash the raw string. Mirrors `hashFileForManifest`.
 */
function hashOutputContent(path: string, content: string): string {
  let payload = content;
  if (shouldNormalizeLineEndings(path)) {
    if (payload.startsWith(UTF8_BOM)) payload = payload.slice(UTF8_BOM.length);
    payload = normalizeLineEndings(payload);
  }
  // Must match the encoding `writeFileAtomic` lands on disk, or a binary output
  // reports drift the moment it is generated.
  const encoding = payloadEncodingFor(path);
  return `sha256:${createHash('sha256').update(payload, encoding).digest('hex')}`;
}

/** Result of comparing locked output hashes against files on disk. */
export interface OutputDiff {
  /** Locked outputs whose on-disk hash differs. */
  readonly outputsModified: string[];
  /** Locked outputs missing from disk. */
  readonly outputsRemoved: string[];
}

/**
 * Build a map of generated-output checksums from generate results.
 * Excludes `skipped` results. Keys are normalized to forward slashes; values
 * are `sha256:<hex>`.
 * @param results - Generate results (created/updated/unchanged/skipped)
 * @returns Record of project-root-relative path → sha256:hex
 */
export function buildOutputChecksums(results: readonly GenerateResult[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of results) {
    if (!TRACKED_STATUSES.has(r.status)) continue;
    out[r.path.replace(/\\/g, '/')] = hashOutputContent(r.path, r.content);
  }
  return out;
}

/**
 * Compare locked output hashes against the files under `rootBase`.
 * Missing file → `outputsRemoved`; different hash → `outputsModified`.
 * Both arrays are sorted for deterministic output.
 * @param rootBase - Project root the output paths are relative to
 * @param lockOutputs - Locked path → sha256:hex map
 */
export async function diffOutputChecksums(
  rootBase: string,
  lockOutputs: Record<string, string>,
): Promise<OutputDiff> {
  const outputsModified: string[] = [];
  const outputsRemoved: string[] = [];

  for (const [relPath, lockedHash] of Object.entries(lockOutputs)) {
    const h = await hashFileForManifest(join(rootBase, relPath));
    if (h === null) {
      outputsRemoved.push(relPath);
      continue;
    }
    const current = h.startsWith('sha256:') ? h : `sha256:${h}`;
    if (current !== lockedHash) outputsModified.push(relPath);
  }

  outputsModified.sort();
  outputsRemoved.sort();
  return { outputsModified, outputsRemoved };
}
