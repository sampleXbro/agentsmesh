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
// Named for what it is. It also used to matter that this was not `plugin/`,
// because the rewriter read the `/plugin` slash command in skill prose as a
// path; that is fixed in link-rebaser-slash-commands.test.ts.
const PLUGIN = join(ROOT, 'claude-plugin');

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PLUGIN, rel), 'utf8')) as Record<string, unknown>;
}

describe('Claude Code plugin', () => {
  it('ships exactly the expected files', () => {
    for (const rel of [
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'skills/lessons/SKILL.md',
    ]) {
      expect(existsSync(join(PLUGIN, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it('embeds the canonical lesson body verbatim, so the rules cannot drift', () => {
    const canonical = readFileSync(join(ROOT, '.agentsmesh/skills/lessons/SKILL.md'), 'utf8');
    const body = canonical.split('---\n', 3)[2]!.replace(/^\n+/, '');
    const bundled = readFileSync(join(PLUGIN, 'skills/lessons/SKILL.md'), 'utf8');
    expect(bundled).toContain(body);
  });

  it('tells the agent to use the MCP tools, which ship with the plugin', () => {
    // The CLI is not a plugin dependency, so a skill that leads with a shell
    // command would fail for anyone who installed only the plugin.
    const bundled = readFileSync(join(PLUGIN, 'skills/lessons/SKILL.md'), 'utf8');
    expect(bundled).toContain('reach lessons through the MCP tools');
    for (const tool of ['lessons_query', 'lessons_add']) expect(bundled).toContain(tool);
  });

  it('ships no hooks — they would cost ~0.9s of npx resolution per tool call', () => {
    expect(existsSync(join(PLUGIN, 'hooks'))).toBe(false);
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

  it('starts the MCP server through npx, so the plugin needs no global install', () => {
    // One process per session, so npx resolution is paid once rather than per
    // tool call. `@latest` because a bare `npx agentsmesh` silently prefers a
    // stale binary already on PATH.
    const mcp = readJson('.mcp.json') as { mcpServers: Record<string, { args: string[] }> };
    expect(mcp.mcpServers.agentsmesh!.args).toEqual(['-y', 'agentsmesh@latest', 'mcp']);
  });
});
