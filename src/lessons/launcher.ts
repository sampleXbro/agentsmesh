import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** First word of a shell command, without surrounding quotes. */
export function commandProgram(command: string): string {
  const m = /^\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(command);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? '';
}

/**
 * A bin folder that is on PATH only while npx (its `_npx` cache) or a package
 * script (`node_modules/.bin`) runs. Git runs a merge driver later, without it.
 */
function isTransientBinDir(dir: string): boolean {
  const parts = dir.split(/[\\/]+/).filter((p) => p !== '');
  const [parent, last] = parts.slice(-2);
  return parts.includes('_npx') || (parent === 'node_modules' && last === '.bin');
}

/**
 * True when the program a command starts with can be found: an existing path,
 * or a name on PATH (trying PATHEXT on Windows), not counting transient bin
 * folders. A merge driver git cannot start is worse than none: git then keeps
 * our side as-is, with no conflict markers.
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
  const dirs = (env.PATH ?? env.Path ?? '')
    .split(win ? ';' : ':')
    .filter((d) => d !== '' && !isTransientBinDir(d));
  return dirs.some((dir) => exts.some((ext) => existsSync(join(dir, program + ext))));
}

/** True when `node_modules/.bin/<name>` (or `<name>.cmd`) exists in `fromDir` or an ancestor. */
export function localBinExists(fromDir: string, name: string): boolean {
  for (let dir = resolve(fromDir); ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', '.bin');
    if (existsSync(join(bin, name)) || existsSync(join(bin, `${name}.cmd`))) return true;
    if (dirname(dir) === dir) return false;
  }
}
