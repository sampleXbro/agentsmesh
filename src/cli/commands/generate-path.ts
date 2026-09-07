import { dirname, resolve, sep } from 'node:path';
import { assertPathInsideRoot } from '../../utils/filesystem/path-containment.js';

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
