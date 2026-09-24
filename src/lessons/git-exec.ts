import { spawnSync } from 'node:child_process';

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export type GitRunner = (cwd: string, args: readonly string[]) => GitResult;

/**
 * Run git synchronously in `cwd`. Status is -1 when git could not start, ran
 * past `timeoutMs`, or overflowed the output cap.
 */
export function runGit(cwd: string, args: readonly string[], timeoutMs?: number): GitResult {
  const r = spawnSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
    windowsHide: true,
  });
  const status = r.error === undefined ? (r.status ?? -1) : -1;
  return { status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
