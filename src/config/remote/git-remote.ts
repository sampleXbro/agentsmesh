import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
import { promisify } from 'node:util';
import { exists, renameWithRetry } from '../../utils/filesystem/fs.js';
import { redactUrlSecrets } from '../../utils/output/redact-url-secrets.js';
import { remoteGitEnv } from './git-env.js';
import { assertAllowedGitUrl } from './remote-source.js';
import type { FetchRemoteOptions, FetchRemoteResult } from './remote-fetcher.js';
import type { ParsedGitSource, ParsedGitlabSource } from './remote-source.js';

const execFileAsync = promisify(execFile);
const REPO_DIRNAME = 'repo';

/**
 * Refuse refs/clone-URLs that begin with `-`. Even though we use `execFile`
 * (no shell expansion), git itself parses leading-dash arguments as flags,
 * and several flags accept executable values (e.g. `--upload-pack=cmd`).
 * Defense-in-depth against option injection through `extends:` URLs.
 */
function ensureNotFlag(value: string, kind: 'ref' | 'clone-url'): void {
  if (value.startsWith('-')) {
    throw new Error(
      `agentsmesh refuses ${kind} starting with "-" (option-injection guard): ${value}`,
    );
  }
}

export async function fetchGitRemoteExtend(
  parsed: ParsedGitSource | ParsedGitlabSource,
  extendName: string,
  options: FetchRemoteOptions,
  cacheDir: string,
  buildCacheKey: (provider: string, identifier: string, ref: string) => string,
): Promise<FetchRemoteResult> {
  const provider = 'cloneUrl' in parsed ? 'gitlab' : 'git';
  const identifier = 'cloneUrl' in parsed ? `${parsed.namespace}/${parsed.project}` : parsed.url;
  const ref = parsed.ref ?? 'HEAD';
  const cacheKey = buildCacheKey(provider, identifier, ref);
  const cacheRoot = join(cacheDir, cacheKey);
  const cacheRepoDir = join(cacheRoot, REPO_DIRNAME);
  const stagedRoot = `${cacheRoot}.tmp`;
  const stagedRepoDir = join(stagedRoot, REPO_DIRNAME);

  if (!options.refresh && (await hasCachedRepo(cacheRepoDir))) {
    return readCachedRepo(cacheRepoDir);
  }

  try {
    await rm(stagedRoot, { recursive: true, force: true });
    await mkdir(stagedRoot, { recursive: true });
    await cloneRepo(resolveCloneUrl(parsed), stagedRepoDir);
    if (parsed.ref) await checkoutRef(stagedRepoDir, parsed.ref);
    await rm(cacheRoot, { recursive: true, force: true });
    // Windows can EPERM this rename: `git clone` just exited and its handle (or
    // an AV/indexer scan) still pins the freshly-written staged tree. Retry
    // until the lock clears instead of surfacing a spurious "fetch failed".
    await renameWithRetry(stagedRoot, cacheRoot);
    return readCachedRepo(cacheRepoDir);
  } catch (err) {
    await rm(stagedRoot, { recursive: true, force: true });
    const allowFallback = options.allowOfflineFallback !== false;
    if (allowFallback && (await hasCachedRepo(cacheRepoDir))) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[agentsmesh] Remote fetch failed for ${extendName}; using cached version. Error: ${redactUrlSecrets(rawMsg)}`,
      );
      return readCachedRepo(cacheRepoDir);
    }
    throw err instanceof Error
      ? Object.assign(new Error(redactUrlSecrets(err.message)), { cause: err.cause })
      : err;
  }
}

async function readCachedRepo(repoDir: string): Promise<FetchRemoteResult> {
  return {
    resolvedPath: repoDir,
    version: await getHeadSha(repoDir),
  };
}

async function hasCachedRepo(repoDir: string): Promise<boolean> {
  return exists(repoDir);
}

function resolveCloneUrl(parsed: ParsedGitSource | ParsedGitlabSource): string {
  if ('cloneUrl' in parsed) {
    const token = process.env.AGENTSMESH_GITLAB_TOKEN;
    if (token) {
      const url = new URL(parsed.cloneUrl);
      if (url.protocol === 'https:') {
        url.username = 'oauth2';
        url.password = token;
        return url.toString();
      }
    }
    return parsed.cloneUrl;
  }
  return parsed.url;
}

async function cloneRepo(cloneUrl: string, repoDir: string): Promise<void> {
  ensureNotFlag(cloneUrl, 'clone-url');
  // Same transport allowlist the ls-remote/ref-resolution path enforces: this
  // is the spawn that actually downloads repo bytes, so it must not be skipped.
  assertAllowedGitUrl(cloneUrl);
  // core.symlinks=false: git writes any symlink in the (untrusted) repo as a
  // plain text file holding the link target, so a planted `keys -> ~/.ssh/id_rsa`
  // cannot exfiltrate host secrets when the cloned tree is later imported or
  // materialized into a pack. Mirrors the tarball extractor's symlink rejection.
  await runGit(['clone', '-c', 'core.symlinks=false', cloneUrl, repoDir]);
}

async function checkoutRef(repoDir: string, ref: string): Promise<void> {
  ensureNotFlag(ref, 'ref');
  await runGit(['checkout', ref], repoDir);
}

async function getHeadSha(repoDir: string): Promise<string> {
  return runGit(['rev-parse', 'HEAD'], repoDir);
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: remoteGitEnv() });
  return stdout.trim();
}
