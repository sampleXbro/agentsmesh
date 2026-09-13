import { existsSync, realpathSync } from 'node:fs';
import { win32 } from 'node:path';
import {
  WINDOWS_ABSOLUTE_PATH,
  pathApi,
  normalizeSeparators,
  normalizeForProject,
  isAbsoluteForProject,
  rootFallbackPath,
} from '../path-helpers.js';
import { getLinkFormatRegistry } from './link-format-registry.js';

export function isRootRelativePathToken(token: string): boolean {
  const normalizedToken = normalizeSeparators(token);
  return getLinkFormatRegistry().rootRelativePrefixes.some((prefix) =>
    normalizedToken.startsWith(prefix),
  );
}

function isMeshRootRelativePathToken(normalizedToken: string): boolean {
  const t = normalizeSeparators(normalizedToken).replace(/^\.\//, '');
  if (t.startsWith('../') || t.startsWith('/')) return false;
  if (WINDOWS_ABSOLUTE_PATH.test(t)) return false;
  if (/^[a-zA-Z]:/.test(t)) return false;
  if (isRootRelativePathToken(t)) return false;
  const first = t.split('/').filter((s) => s.length > 0)[0];
  return first !== undefined && getLinkFormatRegistry().meshRootSegments.has(first);
}
const NON_REWRITABLE_BARE_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'codex.md',
  '.windsurfrules',
  '.cursorrules',
]);

export const PATH_TOKEN =
  /(?:\.\.[\\/]|\.\/|\.\\|\/[A-Za-z0-9._-]|[A-Za-z]:[\\/][A-Za-z0-9._-]|\.agentsmesh[\\/]|\.claude[\\/]|\.cursor[\\/]|\.github[\\/]|\.continue[\\/]|\.junie[\\/]|\.kiro[\\/]|\.gemini[\\/]|\.clinerules[\\/]|\.cline[\\/]|\.codex[\\/]|\.agents[\\/]|\.windsurf[\\/]|\.roo[\\/]|(?:[A-Za-z0-9._-]+[\\/])+|[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)[A-Za-z0-9._@%+~:\\/-]*/g;
export const LINE_NUMBER_SUFFIX = /(?::(\d+)){1,2}$/;

export function resolveProjectPath(
  token: string,
  projectRoot: string,
  sourceFile: string,
): string[] {
  const api = pathApi(projectRoot);
  const normalizedProjectRoot = normalizeForProject(projectRoot, projectRoot);
  const normalizedSourceFile = normalizeForProject(projectRoot, sourceFile);
  const normalizedToken = normalizeSeparators(token);

  if (WINDOWS_ABSOLUTE_PATH.test(token)) {
    const windowsToken = normalizeForProject(projectRoot, token);
    if (api === win32 || windowsToken.startsWith(`${normalizedProjectRoot}${api.sep}`)) {
      return [windowsToken];
    }
    return [windowsToken];
  }
  if (api.isAbsolute(token)) {
    const absoluteToken = normalizeForProject(projectRoot, token);
    if (absoluteToken.startsWith(normalizedProjectRoot) || existsSync(token))
      return [absoluteToken];
    return [normalizeForProject(projectRoot, api.join(projectRoot, token))];
  }
  if (normalizedToken.startsWith('./') || normalizedToken.startsWith('../')) {
    const sourceRelativePath = normalizeForProject(
      projectRoot,
      api.join(api.dirname(normalizedSourceFile), normalizedToken),
    );
    const fallbackPath = rootFallbackPath(normalizedToken, normalizedProjectRoot);
    return fallbackPath && fallbackPath !== sourceRelativePath
      ? [sourceRelativePath, fallbackPath]
      : [sourceRelativePath];
  }
  if (isRootRelativePathToken(normalizedToken)) {
    return [normalizeForProject(projectRoot, api.join(normalizedProjectRoot, normalizedToken))];
  }
  if (normalizedToken.includes('/')) {
    const meshRoot = normalizeForProject(
      projectRoot,
      api.join(normalizedProjectRoot, '.agentsmesh'),
    );
    const fromMesh = isMeshRootRelativePathToken(normalizedToken)
      ? normalizeForProject(projectRoot, api.join(meshRoot, normalizedToken))
      : null;
    const fromProjectRoot = normalizeForProject(
      projectRoot,
      api.join(normalizedProjectRoot, normalizedToken),
    );
    const fromSourceDir = normalizeForProject(
      projectRoot,
      api.join(api.dirname(normalizedSourceFile), normalizedToken),
    );
    if (fromMesh !== null) {
      return [fromMesh, fromProjectRoot, fromSourceDir];
    }
    return [fromProjectRoot, fromSourceDir];
  }
  if (NON_REWRITABLE_BARE_FILES.has(normalizedToken)) return [];
  if (normalizedToken.includes('.')) {
    return [
      normalizeForProject(
        projectRoot,
        api.join(api.dirname(normalizedSourceFile), normalizedToken),
      ),
    ];
  }
  return [];
}

export function expandResolvedPaths(projectRoot: string, resolvedPath: string): string[] {
  const expanded = [resolvedPath];
  if (!isAbsoluteForProject(projectRoot, resolvedPath) || !existsSync(resolvedPath))
    return expanded;
  try {
    const realPaths = [realpathSync(resolvedPath), realpathSync.native(resolvedPath)];
    for (const realPath of realPaths) {
      // Push (not unshift): prefer the caller's projectRoot-shaped path so
      // `path.relative(projectRoot, target)` stays lexically correct. On Windows,
      // `realpathSync.native` expands DOS short names (`RUNNER~1` → `runneradmin`),
      // and putting that ahead of the original detaches the resolved path from
      // a `RUNNER~1`-shaped projectRoot, breaking project-root relativization.
      if (realPath !== resolvedPath && !expanded.includes(realPath)) {
        expanded.push(realPath);
      }
    }
  } catch {
    // Keep the original path when realpath lookup fails.
  }
  return expanded;
}

export function isGlobAdjacent(content: string, start: number, end: number): boolean {
  const prev = start > 0 ? content.at(start - 1) : '';
  const next = end < content.length ? content.at(end) : '';
  return prev === '*' || next === '*';
}
