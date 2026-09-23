import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commandLauncherExists, localBinExists } from '../../../src/lessons/launcher.js';

let bin: string;
beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), 'am-launcher-'));
});
afterEach(() => rmSync(bin, { recursive: true, force: true }));

describe('commandLauncherExists', () => {
  it('finds the first word of a command on PATH', () => {
    writeFileSync(join(bin, 'agentsmesh'), '');
    const env = { PATH: ['/nope', bin].join(':') };
    expect(commandLauncherExists('agentsmesh lessons merge-driver %O %A %B', env, 'linux')).toBe(
      true,
    );
    expect(commandLauncherExists('missing-tool lessons', env, 'linux')).toBe(false);
  });

  it('tries PATHEXT and a `Path` variable on Windows', () => {
    writeFileSync(join(bin, 'npx.CMD'), '');
    const env = { Path: `C:\\nope;${bin}`, PATHEXT: '.EXE;.CMD' };
    expect(commandLauncherExists('npx --no --offline agentsmesh', env, 'win32')).toBe(true);
  });

  it('checks a quoted or slashed program path directly', () => {
    const program = join(bin, 'my node');
    writeFileSync(program, '');
    const fwd = program.replaceAll('\\', '/');
    expect(commandLauncherExists(`"${fwd}" cli.js`, {}, 'linux')).toBe(true);
    expect(commandLauncherExists(`${join(bin, 'absent')} cli.js`, {}, 'linux')).toBe(false);
  });

  it('skips bin folders that exist only while npx or a package script runs', () => {
    const npxCache = join(bin, '.npm', '_npx', 'a1b2', 'node_modules', '.bin');
    const scriptBin = join(bin, 'app', 'node_modules', '.bin');
    for (const dir of [npxCache, scriptBin]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'agentsmesh'), '');
    }
    const command = 'agentsmesh lessons merge-driver %O %A %B';
    expect(commandLauncherExists(command, { PATH: npxCache }, 'linux')).toBe(false);
    expect(commandLauncherExists(command, { PATH: `${scriptBin}/` }, 'linux')).toBe(false);
    writeFileSync(join(bin, 'agentsmesh'), '');
    expect(commandLauncherExists(command, { PATH: [npxCache, bin].join(':') }, 'linux')).toBe(true);
  });

  it('is false for an empty command', () => {
    expect(commandLauncherExists('   ', { PATH: bin }, 'linux')).toBe(false);
  });
});

describe('localBinExists', () => {
  it('finds node_modules/.bin/<name> or <name>.cmd in the folder or an ancestor', () => {
    const deep = join(bin, 'repo', 'packages', 'app');
    mkdirSync(deep, { recursive: true });
    expect(localBinExists(deep, 'agentsmesh')).toBe(false);
    mkdirSync(join(bin, 'repo', 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(bin, 'repo', 'node_modules', '.bin', 'agentsmesh.cmd'), '');
    expect(localBinExists(deep, 'agentsmesh')).toBe(true);
    expect(localBinExists(bin, 'agentsmesh')).toBe(false);
  });
});
