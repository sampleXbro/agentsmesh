import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Runs git in `cwd` with a fixed identity, no signing and no hooks from the host config. */
export function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'AgentsMesh Tests',
      GIT_AUTHOR_EMAIL: 'tests@example.com',
      GIT_COMMITTER_NAME: 'AgentsMesh Tests',
      GIT_COMMITTER_EMAIL: 'tests@example.com',
    },
  });
}

export function initRepo(root: string): void {
  git(root, ['init', '--quiet', '--initial-branch=main']);
}

export function writeFile(root: string, rel: string, content = 'x\n'): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

export function commitAll(root: string, message: string): void {
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '--no-verify', '--allow-empty', '-m', message]);
}

/** Git vars a hook exports; left set, they point git at another repo. */
export const GIT_HOOK_ENV = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;

/** Delete `keys` from process.env; the returned function restores them. */
export function clearEnv(keys: readonly string[]): () => void {
  const saved = keys.map((k) => [k, process.env[k]] as const);
  for (const k of keys) delete process.env[k];
  return () => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}
