/**
 * Importing a second tool, with `import` or `init --yes`, adds to canonical
 * permissions, ignore patterns and MCP servers instead of replacing them, so a
 * deny rule or a server the first import brought in is never dropped (#131).
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTempProject } from '../../../helpers/temp-project.js';
import { runImport } from '../../../../src/cli/commands/import.js';
import { runInit } from '../../../../src/cli/commands/init.js';

const PERMS = '.agentsmesh/permissions.yaml';
const IGNORE = '.agentsmesh/ignore';

const { root, write, read } = useTempProject('am-import-keep-');

const perms = (): unknown => parseYaml(read(PERMS));

function claudeAndCursor(): void {
  write('CLAUDE.md', '# Project\n');
  write(
    '.claude/settings.json',
    JSON.stringify({
      permissions: { deny: ['Read(./secrets/**)', 'Bash(rm -rf:*)'], allow: ['Bash(npm test)'] },
    }),
  );
  write('.claudeignore', 'secrets/\n');
  write('.cursor/cli.json', JSON.stringify({ permissions: { allow: ['Shell(ls)'] } }));
  write('.cursorignore', 'build/\n');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('importing a second tool', () => {
  it('keeps the first tool deny rules and ignore patterns', async () => {
    claudeAndCursor();

    await runImport({ from: 'claude-code' }, root());
    await runImport({ from: 'cursor' }, root());

    expect(perms()).toEqual({
      allow: ['Bash(npm test)', 'Shell(ls)'],
      deny: ['Read(./secrets/**)', 'Bash(rm -rf:*)'],
    });
    expect(read(IGNORE)).toBe('secrets/\nbuild/\n');
  });

  it('keeps them in the other order too', async () => {
    claudeAndCursor();

    await runImport({ from: 'cursor' }, root());
    await runImport({ from: 'claude-code' }, root());

    expect(perms()).toEqual({
      allow: ['Shell(ls)', 'Bash(npm test)'],
      deny: ['Read(./secrets/**)', 'Bash(rm -rf:*)'],
      ask: [],
    });
    expect(read(IGNORE)).toBe('build/\nsecrets/\n');
  });

  it('keeps MCP servers from a tool whose importer writes mcp.json itself', async () => {
    write('CLAUDE.md', '# Root\n');
    write(
      '.mcp.json',
      JSON.stringify({ mcpServers: { claudeonly: { command: 'a' }, shared: { command: 'c' } } }),
    );
    write(
      '.gemini/settings.json',
      JSON.stringify({ mcpServers: { geminionly: { command: 'b' }, shared: { command: 'g' } } }),
    );

    await runImport({ from: 'claude-code' }, root());
    await runImport({ from: 'gemini-cli' }, root());

    const servers = (
      JSON.parse(read('.agentsmesh/mcp.json')) as {
        mcpServers: Record<string, { command?: string }>;
      }
    ).mcpServers;
    expect(Object.keys(servers).sort()).toEqual([
      'agentsmesh',
      'claudeonly',
      'geminionly',
      'shared',
    ]);
    expect(servers.shared?.command).toBe('g');
  });

  it('leaves the files byte-identical when the same tool is imported again', async () => {
    claudeAndCursor();
    await runImport({ from: 'claude-code' }, root());
    const first = [read(PERMS), read(IGNORE)];

    await runImport({ from: 'claude-code' }, root());

    expect([read(PERMS), read(IGNORE)]).toEqual(first);
  });

  it('init --yes keeps the settings of every detected tool', async () => {
    claudeAndCursor();
    // init detects Cursor by its rules, not by cli.json.
    write('.cursor/rules/style.mdc', '---\ndescription: Style\n---\n# Style\n');
    // init reads HOME to pick targets; keep this machine's tools out of it.
    const home = join(root(), 'home');
    mkdirSync(home);
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);

    await runInit(root(), { yes: true });

    const merged = perms() as { allow: string[]; deny: string[] };
    expect([[...merged.allow].sort(), [...merged.deny].sort()]).toEqual([
      ['Bash(npm test)', 'Shell(ls)'],
      ['Bash(rm -rf:*)', 'Read(./secrets/**)'],
    ]);
    expect(read(IGNORE).split('\n').filter(Boolean).sort()).toEqual(['build/', 'secrets/']);
  });
});
