/**
 * Emit copied files as generate results (target id `files`, no reference rewrite).
 */

import { join } from 'node:path';
import type { CanonicalCopiedFile } from './types.js';
import type { GenerateResult } from '../../../core/result-types.js';
import { computeStatus } from '../../../core/generate/feature-loop.js';
import { readFileSafe } from '../../../utils/filesystem/fs.js';
import { normalizeTextPayload } from '../../../utils/filesystem/fs-text-encoding.js';

/** Synthetic target label for lock/output attribution; not a descriptor id. */
export const FILES_TARGET_ID = 'files';

/**
 * Build generate results for each copied file. Content is normalized the way
 * `writeFileAtomic` will store it so status and lock hashes stay in sync.
 */
export async function emitCopiedFiles(
  files: readonly CanonicalCopiedFile[],
  projectRoot: string,
): Promise<GenerateResult[]> {
  const results: GenerateResult[] = [];
  for (const file of files) {
    const content = normalizeTextPayload(file.path, file.content);
    const existing = await readFileSafe(join(projectRoot, file.path));
    results.push({
      target: FILES_TARGET_ID,
      path: file.path.replaceAll('\\', '/'),
      content,
      currentContent: existing ?? undefined,
      status: computeStatus(existing, content),
      ...(file.mode !== undefined ? { mode: file.mode } : {}),
    });
  }
  return results;
}

/** Project-root paths this feature will write (for lock `verbatimOutputs`). */
export function verbatimPathsFromResults(results: readonly GenerateResult[]): string[] {
  return results
    .filter(
      (r) =>
        r.target === FILES_TARGET_ID &&
        (r.status === 'created' || r.status === 'updated' || r.status === 'unchanged'),
    )
    .map((r) => r.path.replaceAll('\\', '/'))
    .sort();
}
