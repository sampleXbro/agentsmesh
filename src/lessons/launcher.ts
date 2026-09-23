import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** First word of a shell command, without surrounding quotes. */
export function commandProgram(command: string): string {
  const m = /^\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(command);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? '';
}

/**
 * True when the program a command starts with can be found: an existing path,
 * or a name on PATH (trying PATHEXT on Windows). A merge driver git cannot start
 * is worse than none: git then keeps our side as-is, with no conflict markers.
 */
export function commandLauncherExists(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const program = commandProgram(command);
  if (program === '') return false;
  if (program.includes('/') || program.includes('\\')) return existsSync(program);
  const win = platform === 'win32';
  const exts = win ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')] : [''];
  const dirs = (env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter((d) => d !== '');
  return dirs.some((dir) => exts.some((ext) => existsSync(join(dir, program + ext))));
}
