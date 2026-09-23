import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commandLauncherExists } from '../../../src/lessons/launcher.js';

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

  it('is false for an empty command', () => {
    expect(commandLauncherExists('   ', { PATH: bin }, 'linux')).toBe(false);
  });
});
