import { dirname, resolve, sep } from 'node:path';
import { assertPathInsideRoot } from '../../utils/filesystem/path-containment.js';
import {
  assertManagedOutputsInsideRoot,
  type OutputBoundaryArgs,
} from '../../core/generate/output-boundaries.js';

export function ensurePathInsideRoot(
  rootDir: string,
  relativePath: string,
  target: string,
): string {
  const rootAbs = resolve(rootDir);
  const outputAbs = resolve(rootDir, relativePath);
  if (outputAbs === rootAbs || outputAbs.startsWith(`${rootAbs}${sep}`)) return outputAbs;
  throw new Error(
    `Unsafe generated output path for ${target}: ${relativePath.replaceAll('\\', '/')}`,
  );
}

export async function ensureSafeOutputPath(
  rootDir: string,
  relativePath: string,
  target: string,
): Promise<string> {
  const output = ensurePathInsideRoot(rootDir, relativePath, target);
  // Atomic writes replace the leaf; only its parents can redirect the write.
  await assertPathInsideRoot(rootDir, dirname(output));
  return output;
}

interface OutputResult {
  readonly path: string;
  readonly target: string;
  readonly status: string;
}

/**
 * Whole-run boundary check: every output path this run produced and every
 * managed directory of the active targets. Runs before any write and under
 * --dry-run too, so a failure is atomic and a preview never reports OK for a
 * layout the real run would reject.
 */
export async function assertOutputBoundary(
  results: readonly OutputResult[],
  boundary: OutputBoundaryArgs,
): Promise<void> {
  await Promise.all([
    ...results
      .filter((r) => r.status !== 'skipped')
      .map((r) => ensureSafeOutputPath(boundary.projectRoot, r.path, r.target)),
    assertManagedOutputsInsideRoot(boundary),
  ]);
}
