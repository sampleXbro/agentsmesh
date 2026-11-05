/**
 * Resolve git refs to full SHAs (install pinning).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { remoteGitEnv } from '../../config/remote/git-env.js';
import { assertAllowedGitUrl } from '../../config/remote/remote-source.js';

const execFileAsync = promisify(execFile);

function ensureNotFlag(value: string, kind: string): void {
  if (value.startsWith('-')) {
    throw new Error(
      `agentsmesh refuses ${kind} starting with "-" (option-injection guard): ${value}`,
    );
  }
}

async function runGit(args: string[]): Promise<string> {
  // The URL allowlist is the primary gate, enforced by callers via assertAllowedGitUrl.
  const { stdout } = await execFileAsync('git', args, { env: remoteGitEnv() });
  return stdout.trim();
}

/** True if git is available on PATH. */
export async function isGitAvailable(): Promise<boolean> {
  try {
    await runGit(['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a remote ref (branch or tag) to a commit SHA via ls-remote.
 */
export async function gitLsRemoteResolve(remoteUrl: string, ref: string): Promise<string> {
  ensureNotFlag(remoteUrl, 'remote-url');
  ensureNotFlag(ref, 'ref');
  assertAllowedGitUrl(remoteUrl);
  const tryRefs = [ref, `refs/heads/${ref}`, `refs/tags/${ref}`];
  let lastErr: unknown;
  for (const r of tryRefs) {
    try {
      const out = await runGit(['ls-remote', remoteUrl, r]);
      const line = out
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      if (!line) continue;
      const sha = line.split(/\s+/)[0];
      if (sha && /^[0-9a-f]{40}$/i.test(sha)) return sha;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Could not resolve ref "${ref}" for ${remoteUrl}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/** Resolve branch/tag/HEAD to full SHA for pinning. */
export async function resolveRemoteRefForInstall(ref: string, remoteUrl: string): Promise<string> {
  ensureNotFlag(remoteUrl, 'remote-url');
  const r = ref === '' ? 'HEAD' : ref;
  ensureNotFlag(r, 'ref');
  if (/^[0-9a-f]{40}$/i.test(r)) return r.toLowerCase();
  // Validate the transport only once we know a git spawn is required (a direct
  // SHA needs no remote contact, so `remoteUrl` may legitimately be unused).
  assertAllowedGitUrl(remoteUrl);
  if (r === 'HEAD') {
    const out = await runGit(['ls-remote', remoteUrl, 'HEAD']);
    const line = out.split('\n').find((l) => l.trim().length > 0);
    if (!line) throw new Error(`Could not resolve HEAD for ${remoteUrl}`);
    const sha = line.split(/\s+/)[0];
    if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) {
      throw new Error(`Invalid ls-remote HEAD line for ${remoteUrl}`);
    }
    return sha.toLowerCase();
  }
  return gitLsRemoteResolve(remoteUrl, r);
}
