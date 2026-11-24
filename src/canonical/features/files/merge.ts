/**
 * Merge copied-file lists: overlay wins on the same project-root path.
 */

import type { CanonicalCopiedFile } from './types.js';

/**
 * Overlay replaces base entries with the same `path`. When both sides are
 * empty/absent, returns `undefined` so `CanonicalFiles.files` stays optional.
 */
export function mergeCopiedFiles(
  base: readonly CanonicalCopiedFile[] | undefined,
  overlay: readonly CanonicalCopiedFile[] | undefined,
): CanonicalCopiedFile[] | undefined {
  if (!base?.length && !overlay?.length) return undefined;
  const merged = [
    ...new Map(
      [...(base ?? []), ...(overlay ?? [])].map((file) => [file.path, file] as const),
    ).values(),
  ];
  return merged.sort((a, b) => a.path.localeCompare(b.path));
}
