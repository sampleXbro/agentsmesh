/**
 * Start-time identity of a process. A lock holder records its own identity so
 * a later reader can tell the holder apart from an unrelated process that got
 * the same pid (pid reuse after a crash, a reboot, or a container restart).
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PS_TIMEOUT_MS = 2_000;

let self: Promise<string | null> | undefined;

/**
 * An identity that stays the same for the whole life of `pid` and differs for
 * any later process with that pid. Null when the pid is not running or the
 * platform has no cheap probe (Windows).
 */
export async function processIdentity(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 0 || platform === 'win32') return null;
  try {
    return platform === 'linux' ? await linuxIdentity(pid) : await psIdentity(pid);
  } catch {
    return null;
  }
}

/** Identity of the current process, probed once. */
export function selfIdentity(): Promise<string | null> {
  self ??= processIdentity(process.pid);
  return self;
}

/** `<boot id>:<start ticks>` from `/proc/<pid>/stat`; wall-clock changes do not move it. */
export function linuxStartIdentity(stat: string, bootId: string): string | null {
  // Fields after "(comm)" start at field 3, so starttime (field 22) is index 19.
  const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const boot = bootId.trim();
  if (start === undefined || !/^\d+$/.test(start) || boot === '') return null;
  return `${boot}:${start}`;
}

async function linuxIdentity(pid: number): Promise<string | null> {
  const [stat, bootId] = await Promise.all([
    readFile(`/proc/${pid}/stat`, 'utf-8'),
    readFile('/proc/sys/kernel/random/boot_id', 'utf-8'),
  ]);
  return linuxStartIdentity(stat, bootId);
}

async function psIdentity(pid: number): Promise<string | null> {
  // UTC and the C locale keep the printed start time stable across DST and locales.
  const { stdout } = await execFileAsync('ps', ['-o', 'lstart=', '-p', String(pid)], {
    env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
    timeout: PS_TIMEOUT_MS,
  });
  const start = stdout.trim();
  return start === '' ? null : start;
}
