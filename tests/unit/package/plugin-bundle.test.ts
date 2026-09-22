/**
 * One bundle, two plugin clients, one copy of the skill.
 *
 * Claude Code reads `.claude-plugin/plugin.json` + `.mcp.json`. Codex reads the
 * portable Agent Plugins manifest: `plugin.json` + `mcp.json` at the bundle
 * root, whose schemas live at agent-plugins.org/schemas/1.0.0. The two formats
 * differ only in where the manifest sits and how presentation fields nest, so
 * the skill is shared rather than duplicated — a second copy is exactly the
 * drift this project exists to prevent.
 *
 * Codex also still accepts a legacy `.codex-plugin/plugin.json`, which is what
 * OpenAI's own curated plugins ship. We deliberately do not: the docs call it a
 * compatibility fallback, and shipping both manifests would leave Codex
 * choosing between two sources of truth that we cannot test locally.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { syncVersion } from '../../../scripts/sync-release-versions-core.js';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, 'plugins/agentsmesh-lessons');
const AGENT_PLUGINS = 'https://agent-plugins.org/schemas/1.0.0';

const packageVersion = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).replaceAll('\\', '/'));
    }
  };
  walk(dir);
  return out.sort();
}

describe('bundle layout', () => {
  it('ships exactly these files, one skill copy serving both clients', () => {
    expect(filesUnder(BUNDLE)).toEqual([
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'mcp.json',
      'plugin.json',
      'skills/lessons/SKILL.md',
    ]);
  });

  it('ships no hooks, which would cost a fresh npx resolution per tool call', () => {
    expect(existsSync(join(BUNDLE, 'hooks'))).toBe(false);
  });

  it('ships no legacy Codex manifest, so Codex has one manifest to read', () => {
    expect(existsSync(join(BUNDLE, '.codex-plugin'))).toBe(false);
  });
});

describe('portable Agent Plugins manifest', () => {
  const manifest = () => readJson(join(BUNDLE, 'plugin.json'));

  it('declares the 1.0.0 manifest schema', () => {
    expect(manifest().$schema).toBe(`${AGENT_PLUGINS}/plugin.schema.json`);
  });

  it('uses a name the spec pattern accepts', () => {
    expect(manifest().name).toMatch(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  });

  it('carries only root keys the schema allows, which forbids extras', () => {
    // The manifest schema sets additionalProperties:false, so a stray
    // `displayName` at the root fails validation rather than being ignored.
    const allowed = new Set([
      '$schema',
      'name',
      'version',
      'description',
      'author',
      'homepage',
      'repository',
      'license',
      'keywords',
      'extensions',
    ]);
    expect(Object.keys(manifest()).filter((k) => !allowed.has(k))).toEqual([]);
  });

  it('nests presentation under the OpenAI extension namespace', () => {
    const ext = manifest().extensions as Record<string, { interface?: { displayName?: string } }>;
    expect(ext['com.openai']?.interface?.displayName).toBe('AgentsMesh Lessons');
  });
});

describe('MCP server', () => {
  const portable = () => readJson(join(BUNDLE, 'mcp.json'));
  const claude = () => readJson(join(BUNDLE, '.mcp.json'));
  const server = { type: 'stdio', command: 'npx', args: ['-y', 'agentsmesh@latest', 'mcp'] };

  it('declares the 1.0.0 MCP schema on the portable config', () => {
    expect(portable().$schema).toBe(`${AGENT_PLUGINS}/mcp.schema.json`);
  });

  it('starts the same server for both clients, so neither can drift', () => {
    // `@latest` because a bare `npx agentsmesh` silently prefers a stale binary
    // already on PATH. One process per session, so resolution is paid once.
    expect(portable().mcpServers).toEqual({ agentsmesh: server });
    expect(claude().mcpServers).toEqual({ agentsmesh: server });
  });

  it('keys the Claude config to exactly one server and no schema field', () => {
    expect(Object.keys(claude())).toEqual(['mcpServers']);
  });
});

describe('Claude Code manifest', () => {
  const manifest = () => readJson(join(BUNDLE, '.claude-plugin/plugin.json'));

  it('declares a kebab-case name, which Claude Code requires', () => {
    expect(manifest().name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('names the same plugin as the portable manifest', () => {
    expect(manifest().name).toBe(readJson(join(BUNDLE, 'plugin.json')).name);
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
    expect(Object.keys(manifest()).filter((k) => !known.has(k))).toEqual([]);
  });
});

describe('the skill is canonical, not a fork', () => {
  it('embeds the canonical body verbatim, so the rules cannot drift', () => {
    const canonical = readFileSync(join(ROOT, '.agentsmesh/skills/lessons/SKILL.md'), 'utf8');
    const body = canonical.split('---\n', 3)[2]!.replace(/^\n+/, '');
    expect(readFileSync(join(BUNDLE, 'skills/lessons/SKILL.md'), 'utf8')).toContain(body);
  });

  it('tells the agent to use the MCP tools, which ship with the plugin', () => {
    // Neither client installs the CLI, so a skill leading with a shell command
    // would fail for anyone who installed only the plugin.
    const bundled = readFileSync(join(BUNDLE, 'skills/lessons/SKILL.md'), 'utf8');
    expect(bundled).toContain('reach lessons through the MCP tools');
    for (const tool of ['lessons_query', 'lessons_add']) expect(bundled).toContain(tool);
  });
});

describe('versions are generated, never hand-bumped', () => {
  it.each(['plugin.json', '.claude-plugin/plugin.json'])('%s matches package.json', (rel) => {
    expect(readJson(join(BUNDLE, rel)).version).toBe(packageVersion);
  });

  it('rewrites a manifest version and nothing else', () => {
    const before = readFileSync(join(BUNDLE, 'plugin.json'), 'utf8');
    const after = JSON.parse(syncVersion(before, '9.9.9')) as Record<string, unknown>;
    expect(after.version).toBe('9.9.9');
    expect({ ...after, version: packageVersion }).toEqual(JSON.parse(before));
  });
});
