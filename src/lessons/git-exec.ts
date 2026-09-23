import { spawnSync } from 'node:child_process';

export interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export type GitRunner = (cwd: string, args: readonly string[]) => GitResult;

/** Run git synchronously in `cwd`. Status is -1 when git could not be started at all. */
export function runGit(cwd: string, args: readonly string[]): GitResult {
  const r = spawnSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
