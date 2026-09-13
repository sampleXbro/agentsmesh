/**
 * Remote extend fetcher — dispatches to supported remote source providers.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fetchGitRemoteExtend } from './git-remote.js';
import { fetchGithubRemoteExtend, resolveLatestTag } from './github-remote.js';
import {
  parseGitSource,
  parseGitlabSource,
  parseGithubSource,
  parseRemoteSource,
} from './remote-source.js';
import { sweepStaleCache } from '../../install/pack/cache-cleanup.js';
import { stripUrlCredentials } from '../../utils/output/redact-url-secrets.js';

export { parseGitSource, parseGitlabSource, parseGithubSource, resolveLatestTag };

/** Result of fetching a remote extend */
export interface FetchRemoteResult {
  resolvedPath: string;
  version: string;
}

/** Options for fetchRemoteExtend */
export interface FetchRemoteOptions {
  cacheDir?: string;
  token?: string;
  refresh?: boolean;
  /** When false, network failure does not fall back to cached tarball (install flow). */
  allowOfflineFallback?: boolean;
}

const MAX_CACHE_KEY_LENGTH = 80;
const CACHE_KEY_HASH_LENGTH = 12;

/**
 * Keys are `<readable>--<hash>`. The readable part is lossy (`/` and `_` both
 * become `_`, and `--` doubles as a separator), so the hash of the raw
 * provider|identifier|ref keeps distinct sources out of one cache directory.
 */
export function buildCacheKey(provider: string, identifier: string, ref: string): string {
  // A credentialed remote must not name a directory on disk, and the same
  // repository reached with or without a token is one cache entry.
  identifier = stripUrlCredentials(identifier);
  const safe = (value: string): string =>
    value.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^\.+/, '_');
  const [org, repo] = provider === 'github' ? identifier.split('/', 2) : [];
  const readable =
    org && repo
      ? `${safe(org)}--${safe(repo)}--${safe(ref)}`
      : `${safe(provider)}__${safe(identifier)}__${safe(ref)}`;
  const hash = createHash('sha256')
    .update(`${provider}|${identifier}|${ref}`)
    .digest('hex')
    .slice(0, CACHE_KEY_HASH_LENGTH);
  const maxReadable = MAX_CACHE_KEY_LENGTH - CACHE_KEY_HASH_LENGTH - 2;
  return `${readable.slice(0, maxReadable)}--${hash}`;
}

/**
 * Get default cache directory (~/.agentsmesh/cache or AGENTSMESH_CACHE).
 *
 * If `AGENTSMESH_CACHE` is set, it must be an absolute path that is not the
 * filesystem root. We later `rm -rf` keyed subdirectories of this path; an
 * accidental `AGENTSMESH_CACHE=/` would otherwise let cache cleanup target
 * top-level directories.
 */
export function getCacheDir(): string {
  const env = process.env.AGENTSMESH_CACHE;
  if (env) {
    const trimmed = env.trim();
    if (!trimmed) {
      return join(homedir(), '.agentsmesh', 'cache');
    }
    const isAbs = /^([A-Za-z]:[\\/]|\/)/.test(trimmed);
    if (!isAbs) {
      throw new Error(`AGENTSMESH_CACHE must be an absolute path (got: "${trimmed}").`);
    }
    if (trimmed === '/' || /^[A-Za-z]:[\\/]?$/.test(trimmed)) {
      throw new Error(`AGENTSMESH_CACHE must not be the filesystem root (got: "${trimmed}").`);
    }
    return trimmed;
  }
  return join(homedir(), '.agentsmesh', 'cache');
}

/**
 * Fetch remote extend, supporting GitHub tarballs and Git-backed providers.
 */
export async function fetchRemoteExtend(
  source: string,
  extendName: string,
  options: FetchRemoteOptions = {},
): Promise<FetchRemoteResult> {
  const parsed = parseRemoteSource(source);
  if (!parsed) {
    if (source.startsWith('github:')) {
      throw new Error(`Invalid github: source: "${source}" for extend "${extendName}"`);
    }
    if (source.startsWith('gitlab:')) {
      throw new Error(`Invalid gitlab: source: "${source}" for extend "${extendName}"`);
    }
    if (source.startsWith('git+')) {
      throw new Error(`Invalid git+ source: "${source}" for extend "${extendName}"`);
    }
    throw new Error(
      `Invalid remote source: "${source}" for extend "${extendName}". ` +
        'Use github:org/repo@tag, gitlab:group/project@ref, or git+https://host/org/repo.git#ref.',
    );
  }

  const cacheDir = options.cacheDir ?? getCacheDir();

  // Fire-and-forget: sweep entries older than AGENTSMESH_CACHE_MAX_AGE_DAYS (default 30d)
  // so the cache does not grow unboundedly without user intervention.
  void sweepStaleCache(cacheDir).catch(() => {});

  if (parsed.kind === 'github') {
    return fetchGithubRemoteExtend(
      parsed,
      extendName,
      options,
      cacheDir,
      buildCacheKey,
      !source.includes('@'),
    );
  }
  return fetchGitRemoteExtend(parsed, extendName, options, cacheDir, buildCacheKey);
}
