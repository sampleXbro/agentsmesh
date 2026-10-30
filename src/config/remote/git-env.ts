import { gitAllowProtocolEnv } from './remote-source.js';
import { REPO_LOCAL_GIT_ENV } from './repo-local-git-env.js';

export { REPO_LOCAL_GIT_ENV };

/**
 * Env for git talking to a remote or its cache clone, never the caller's repo
 * (agentsmesh may run inside a git hook): no prompts, allowlisted transports.
 */
export function remoteGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    // Defense-in-depth against a remote redirecting (or insteadOf) to a
    // dangerous transport mid-clone; mirrors the URL allowlist.
    GIT_ALLOW_PROTOCOL: gitAllowProtocolEnv(),
  };
  for (const key of REPO_LOCAL_GIT_ENV) delete env[key];
  return env;
}
