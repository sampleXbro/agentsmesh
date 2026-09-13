/**
 * Fetch remote content for install (strict network; pinned SHA).
 */

import { fetchRemoteExtend, getCacheDir } from '../../config/remote/remote-fetcher.js';
import { resolveRemoteRefForInstall } from './git-pin.js';
import type { ParsedInstallSource } from './url-parser.js';
import { stripUrlCredentials } from '../../utils/output/redact-url-secrets.js';

export interface FetchInstallResult {
  resolvedPath: string;
  sourceForYaml: string;
  version?: string;
}

export async function fetchInstallSource(parsed: ParsedInstallSource): Promise<FetchInstallResult> {
  if (parsed.kind === 'local') {
    return {
      resolvedPath: parsed.localRoot!,
      sourceForYaml: parsed.localSourceForYaml!,
    };
  }

  const remote = parsed.gitRemoteUrl;
  if (!remote) throw new Error('Internal error: missing git remote URL');

  const sha = await resolveRemoteRefForInstall(parsed.rawRef || 'HEAD', remote);

  if (parsed.kind === 'github') {
    const src = `github:${parsed.org}/${parsed.repo}@${sha}`;
    const fetched = await fetchRemoteExtend(src, 'install', {
      cacheDir: getCacheDir(),
      refresh: false,
      allowOfflineFallback: false,
    });
    return { resolvedPath: fetched.resolvedPath, sourceForYaml: src, version: sha };
  }

  if (parsed.kind === 'gitlab') {
    const src = `gitlab:${parsed.org}/${parsed.repo}@${sha}`;
    const fetched = await fetchRemoteExtend(src, 'install', {
      cacheDir: getCacheDir(),
      refresh: false,
      allowOfflineFallback: false,
    });
    return { resolvedPath: fetched.resolvedPath, sourceForYaml: src, version: sha };
  }

  const fragment = sha;
  const base = (parsed.gitPlusBase ?? remote).split('#')[0];
  const src = `git+${base}#${fragment}`;
  // The fetch above may carry a token; what we hand back is recorded in
  // `installs.yaml` / `pack.yaml`, which the team commits.
  const persisted = stripUrlCredentials(src);
  const fetched = await fetchRemoteExtend(src, 'install', {
    cacheDir: getCacheDir(),
    refresh: false,
    allowOfflineFallback: false,
  });
  return { resolvedPath: fetched.resolvedPath, sourceForYaml: persisted, version: sha };
}
