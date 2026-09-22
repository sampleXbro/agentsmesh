/**
 * A catalog per client, so the bundle installs with one command.
 *
 * Codex reads `.agents/plugins/marketplace.json`; Claude Code reads
 * `.claude-plugin/marketplace.json`. Both resolve a plugin's path from the
 * repository root, so the two entries point at the same directory. Kept apart
 * from plugin-bundle.test.ts because these describe distribution, not the
 * bundle's own contents.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, 'plugins/agentsmesh-lessons');
const MARKETPLACE = join(ROOT, '.agents/plugins/marketplace.json');
const CLAUDE_MARKETPLACE = join(ROOT, '.claude-plugin/marketplace.json');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('marketplace catalogs', () => {
  // Each client reads its own catalog, and both resolve `./plugins/<name>` from
  // the repository root rather than from the directory holding the catalog
  // (confirmed against openai/plugins, which ships exactly this layout).
  const codex = () =>
    readJson(MARKETPLACE) as unknown as {
      plugins: { name: string; source: { source: string; path: string } }[];
    };
  const claude = () =>
    readJson(CLAUDE_MARKETPLACE) as unknown as {
      owner: { name: string };
      description?: string;
      plugins: { name: string; source: string }[];
    };

  it('offers the bundle to Codex at a repo-root-relative path', () => {
    expect(codex().plugins).toHaveLength(1);
    expect(codex().plugins[0]!.source).toEqual({
      source: 'local',
      path: './plugins/agentsmesh-lessons',
    });
  });

  it('offers the bundle to Claude Code at the same path', () => {
    expect(claude().plugins).toHaveLength(1);
    expect(claude().plugins[0]!.source).toBe('./plugins/agentsmesh-lessons');
  });

  it('carries a marketplace description, which --strict validation demands', () => {
    // `claude plugin validate . --strict` fails on a catalog without one, and
    // the documented schema does not list it as required.
    expect(claude().description).toBeTruthy();
    expect(claude().owner.name).toBeTruthy();
  });

  it('names both entries as the manifests do', () => {
    const name = readJson(join(BUNDLE, 'plugin.json')).name;
    expect(codex().plugins[0]!.name).toBe(name);
    expect(claude().plugins[0]!.name).toBe(name);
  });
});
