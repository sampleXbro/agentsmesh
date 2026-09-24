/**
 * Non-interactive `init` without `--yes` used to find existing tool config,
 * print only a hint, and still enable that tool, so the next `generate`
 * replaced the user's files (in global mode `~/.claude/CLAUDE.md` and the MCP
 * servers in `~/.claude.json`, with no git history to restore them). It now
 * refuses and writes nothing when a detected tool would be enabled (#130).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../../../src/cli/commands/init.js';

const REFUSED = /Found existing configurations: claude-code\..*agentsmesh init --yes/s;

let base: string;
let proj: string;
let home: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-init-existing-')));
  proj = join(base, 'proj');
  home = join(base, 'home');
  mkdirSync(proj);
  mkdirSync(home);
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe('non-interactive init with existing tool config and no --yes', () => {
  it('refuses in a project and writes nothing', async () => {
    writeFileSync(join(proj, 'CLAUDE.md'), '# My rules\n');

    await expect(runInit(proj, {})).rejects.toThrow(REFUSED);

    expect(existsSync(join(proj, 'agentsmesh.yaml'))).toBe(false);
    expect(existsSync(join(proj, '.agentsmesh'))).toBe(false);
    expect(readFileSync(join(proj, 'CLAUDE.md'), 'utf8')).toBe('# My rules\n');
  });

  it('refuses in global mode and leaves the home config alone', async () => {
    mkdirSync(join(home, '.claude'));
    writeFileSync(join(home, '.claude', 'CLAUDE.md'), '- I prefer tabs\n');

    await expect(runInit(proj, { global: true })).rejects.toThrow(REFUSED);

    expect(existsSync(join(home, '.agentsmesh'))).toBe(false);
    expect(readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8')).toBe('- I prefer tabs\n');
  });
});

describe('init paths that stay allowed', () => {
  it('--yes imports the existing config', async () => {
    writeFileSync(join(proj, 'CLAUDE.md'), '# My rules\n');

    const result = await runInit(proj, { yes: true });

    expect([result.exitCode, result.data.imported.length > 0]).toEqual([0, true]);
    expect(readFileSync(join(proj, '.agentsmesh', 'rules', '_root.md'), 'utf8')).toContain(
      '# My rules',
    );
  });

  it('explicit --targets that leave the detected tool out change nothing it owns', async () => {
    writeFileSync(join(proj, 'CLAUDE.md'), '# My rules\n');

    const result = await runInit(proj, { targets: ['cursor'] });

    expect([result.exitCode, result.data.targets]).toEqual([0, ['cursor']]);
    expect(readFileSync(join(proj, 'CLAUDE.md'), 'utf8')).toBe('# My rules\n');
  });
});
