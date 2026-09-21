/**
 * The published Claude Code plugin must not drift from canonical.
 *
 * `plugin/` ships a copy of the lessons skill so the plugin is self-contained
 * for someone who installs it without the CLI. A copy is exactly the failure
 * mode this project exists to prevent, so it is pinned here: edit
 * `.agentsmesh/skills/lessons/SKILL.md` and this test fails until the plugin
 * copy is refreshed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PLUGIN = join(ROOT, 'plugin');

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PLUGIN, rel), 'utf8')) as Record<string, unknown>;
}

describe('Claude Code plugin', () => {
  it('ships exactly the expected files', () => {
    for (const rel of [
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'hooks/hooks.json',
      'skills/lessons/SKILL.md',
    ]) {
      expect(existsSync(join(PLUGIN, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it('bundles the canonical lessons skill byte-for-byte', () => {
    const canonical = readFileSync(join(ROOT, '.agentsmesh/skills/lessons/SKILL.md'), 'utf8');
    const bundled = readFileSync(join(PLUGIN, 'skills/lessons/SKILL.md'), 'utf8');
    expect(bundled).toBe(canonical);
  });

  it('declares a kebab-case name, which Claude Code requires', () => {
    const name = readJson('.claude-plugin/plugin.json').name as string;
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('carries only fields Claude Code recognizes, so --strict validation passes', () => {
    const known = new Set([
      'name',
      'displayName',
      'version',
      'description',
      'author',
      'homepage',
      'repository',
      'license',
      'keywords',
      'metadata',
      'skills',
      'commands',
      'agents',
      'hooks',
      'mcpServers',
      'outputStyles',
      'lspServers',
      'experimental',
      'dependencies',
    ]);
    const unknown = Object.keys(readJson('.claude-plugin/plugin.json')).filter(
      (k) => !known.has(k),
    );
    expect(unknown).toEqual([]);
  });

  it('runs the MCP server and hooks through npx, so the plugin works without a global install', () => {
    const mcp = readJson('.mcp.json') as { mcpServers: Record<string, { args: string[] }> };
    expect(mcp.mcpServers.agentsmesh!.args).toEqual(['-y', 'agentsmesh', 'mcp']);

    const hooks = readJson('hooks/hooks.json') as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    const commands = Object.values(hooks.hooks)
      .flat()
      .flatMap((entry) => entry.hooks.map((h) => h.command));
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) expect(c).toBe('npx -y agentsmesh lessons hook');
  });

  it('wires the three events the lessons loop needs', () => {
    const hooks = readJson('hooks/hooks.json') as { hooks: Record<string, unknown> };
    // Recall on task text and before an edit; capture after a failure.
    expect(Object.keys(hooks.hooks).sort()).toEqual([
      'PostToolUseFailure',
      'PreToolUse',
      'UserPromptSubmit',
    ]);
  });
});
