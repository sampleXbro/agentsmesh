import { relative } from 'node:path';

function normalizeWatchPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function shouldIgnoreWatchPath(canonicalDir: string, changedPath: string): boolean {
  const relPath = normalizeWatchPath(relative(canonicalDir, changedPath));
  // Parent-directory metadata events — chokidar reports a `.agentsmesh/`
  // event whenever a child file write changes the directory mtime. Real
  // canonical edits always arrive as child file events on rules/, commands/,
  // etc. The parent event is pure noise; without this filter the watcher
  // re-triggers on its own lock-file writes (lessons.md L76).
  if (relPath === '') return true;
  // Chokidar can report paths through different resolution layers; use `endsWith`
  // so we reliably ignore lock-file churn regardless of relative prefixing.
  return (
    relPath === '.lock' ||
    relPath === '.lock.tmp' ||
    /(?:^|\/)\.lock\.tmp-[0-9a-f-]+$/.test(relPath) ||
    relPath === '.generate.lock' ||
    relPath.endsWith('/.lock') ||
    relPath.endsWith('/.lock.tmp') ||
    relPath.endsWith('/.generate.lock') ||
    relPath.includes('/.generate.lock/') ||
    relPath.startsWith('.generate.lock/')
  );
}
