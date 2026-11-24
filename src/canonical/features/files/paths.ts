/**
 * Path safety for copied files: reject traversal and tool-owned destinations.
 */

const FORBIDDEN_EXACT = new Set(['agentsmesh.yaml', 'agentsmesh.local.yaml', '.git', '.agentsmesh']);

/** True when `rel` must never be written by the files feature. */
export function isForbiddenOutputPath(rel: string): boolean {
  const n = rel.replaceAll('\\', '/');
  if (FORBIDDEN_EXACT.has(n)) return true;
  if (n.startsWith('.git/') || n.startsWith('.agentsmesh/')) return true;
  return false;
}

/**
 * Normalize and validate a path relative to `.agentsmesh/files/`.
 * @throws Error when the path is absolute, traverses, uses backslashes, or is forbidden.
 */
export function assertSafeCopiedFilePath(rel: string): string {
  if (rel.includes('\\') || rel.includes('\0')) {
    throw new Error(`Copied file path must be a POSIX relative path without backslashes: ${rel}`);
  }
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) {
    throw new Error(`Copied file path must not be absolute: ${rel}`);
  }
  const parts = rel.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) {
    throw new Error(`Copied file path must not contain empty, '.', or '..' segments: ${rel}`);
  }
  if (isForbiddenOutputPath(rel)) {
    throw new Error(
      `Copied file path is reserved and cannot be written by the files feature: ${rel}`,
    );
  }
  return rel;
}
