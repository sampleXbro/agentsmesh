import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAsPack } from '../../../src/install/run/run-install-pack.js';
import type { CanonicalFiles } from '../../../src/core/types.js';
import { exists } from '../../../src/utils/filesystem/fs.js';

describe('installAsPack with forceFreshMaterialize', () => {
  let canonicalDir: string;

  beforeEach(async () => {
    canonicalDir = await mkdtemp(join(tmpdir(), 'install-as-pack-force-fresh-'));
    await mkdir(join(canonicalDir, 'packs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(canonicalDir, { recursive: true, force: true });
  });

  function emptyCanonical(): CanonicalFiles {
    return {
      rules: [],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
  }

  it('forceFreshMaterialize: true replaces existing pack instead of merging', async () => {
    const packsDir = join(canonicalDir, 'packs');
    const existingPackDir = join(packsDir, 'my-pack');
    await mkdir(join(existingPackDir, 'skills', 'old-skill'), { recursive: true });
    await writeFile(join(existingPackDir, 'skills', 'old-skill', 'SKILL.md'), '# OLD');
    await writeFile(
      join(existingPackDir, 'pack.yaml'),
      [
        'name: my-pack',
        'source: github:org/repo',
        'source_kind: github',
        'installed_at: 2026-01-01T00:00:00.000Z',
        'updated_at: 2026-01-01T00:00:00.000Z',
        'content_hash: sha256:0000000000000000000000000000000000000000000000000000000000000000',
        'features:',
        '  - skills',
      ].join('\n'),
    );

    await installAsPack({
      canonicalDir,
      packName: 'my-pack',
      narrowed: emptyCanonical(),
      selected: { skillNames: [], ruleSlugs: [], commandNames: [], agentNames: [] },
      sourceForYaml: 'github:org/repo',
      sourceKind: 'github',
      entryFeatures: ['skills'],
      pick: undefined,
      forceFreshMaterialize: true,
    });

    expect(await exists(join(existingPackDir, 'skills', 'old-skill', 'SKILL.md'))).toBe(false);
    const packYaml = await readFile(join(existingPackDir, 'pack.yaml'), 'utf8');
    expect(packYaml).toContain('source: github:org/repo');
    // Confirm a fresh installed_at — the fixture used 2026-01-01, materialize should set it to "now"
    expect(packYaml).not.toContain('installed_at: 2026-01-01T00:00:00.000Z');
  });

  // ── Case 1: pack dir missing on disk but manifest entry present ────────────
  // refresh's planSinglePack would return 'error' for a missing manifest.json,
  // but a direct installAsPack({forceFreshMaterialize:true}) must succeed because
  // materializePack handles absent finalDir cleanly (skips the rename-to-.old step).

  it('forceFreshMaterialize: true re-materializes when pack dir is absent from disk', async () => {
    const packsDir = join(canonicalDir, 'packs');
    // DO NOT create the pack dir — it's missing (user deleted it manually)

    await installAsPack({
      canonicalDir,
      packName: 'missing-pack',
      narrowed: emptyCanonical(),
      selected: { skillNames: [], ruleSlugs: [], commandNames: [], agentNames: [] },
      sourceForYaml: 'github:org/repo',
      sourceKind: 'github',
      entryFeatures: ['skills'],
      pick: undefined,
      forceFreshMaterialize: true,
    });

    // pack dir must now exist with a fresh pack.yaml
    expect(await exists(join(packsDir, 'missing-pack'))).toBe(true);
    const packYaml = await readFile(join(packsDir, 'missing-pack', 'pack.yaml'), 'utf8');
    expect(packYaml).toContain('source: github:org/repo');
  });

  // ── Case 3: forceFreshMaterialize bypasses collision guard → clobbers other pack ──
  // With forceFreshMaterialize:true the collision check (!forceFreshMaterialize guard)
  // is skipped, so installAsPack WILL overwrite an existing pack even when its
  // source differs. This is intentional for refresh (refresh always targets the
  // exact entry.name from the manifest), but must be documented behavior.

  it('forceFreshMaterialize: true overwrites a colliding same-name pack from a different source', async () => {
    const packsDir = join(canonicalDir, 'packs');
    const packDir = join(packsDir, 'colliding-pack');
    await mkdir(packDir, { recursive: true });
    await writeFile(
      join(packDir, 'pack.yaml'),
      [
        'name: colliding-pack',
        'source: github:other/different-source', // DIFFERENT source
        'source_kind: github',
        'installed_at: 2026-01-01T00:00:00.000Z',
        'updated_at: 2026-01-01T00:00:00.000Z',
        'content_hash: sha256:0000000000000000000000000000000000000000000000000000000000000000',
        'features:',
        '  - skills',
      ].join('\n'),
    );

    // Should NOT throw — forceFreshMaterialize bypasses the collision guard
    await installAsPack({
      canonicalDir,
      packName: 'colliding-pack',
      narrowed: emptyCanonical(),
      selected: { skillNames: [], ruleSlugs: [], commandNames: [], agentNames: [] },
      sourceForYaml: 'github:org/refreshed-source',
      sourceKind: 'github',
      entryFeatures: ['skills'],
      pick: undefined,
      forceFreshMaterialize: true,
    });

    // The pack is overwritten with the new source
    const packYaml = await readFile(join(packDir, 'pack.yaml'), 'utf8');
    expect(packYaml).toContain('source: github:org/refreshed-source');
    expect(packYaml).not.toContain('github:other/different-source');
  });

  it('forceFreshMaterialize: false DOES throw when a colliding same-name different-source pack exists', async () => {
    const packsDir = join(canonicalDir, 'packs');
    const packDir = join(packsDir, 'colliding-pack');
    await mkdir(packDir, { recursive: true });
    await writeFile(
      join(packDir, 'pack.yaml'),
      [
        'name: colliding-pack',
        'source: github:other/different-source',
        'source_kind: github',
        'installed_at: 2026-01-01T00:00:00.000Z',
        'updated_at: 2026-01-01T00:00:00.000Z',
        'content_hash: sha256:0000000000000000000000000000000000000000000000000000000000000000',
        'features:',
        '  - skills',
      ].join('\n'),
    );

    await expect(
      installAsPack({
        canonicalDir,
        packName: 'colliding-pack',
        narrowed: emptyCanonical(),
        selected: { skillNames: [], ruleSlugs: [], commandNames: [], agentNames: [] },
        sourceForYaml: 'github:org/another-source',
        sourceKind: 'github',
        entryFeatures: ['skills'],
        pick: undefined,
        // forceFreshMaterialize NOT set → collision check runs → throws
      }),
    ).rejects.toThrow(/collides/i);
  });

  it('forceFreshMaterialize: false (default) merges a picked subset into the existing pack', async () => {
    const packsDir = join(canonicalDir, 'packs');
    const existingPackDir = join(packsDir, 'my-pack');
    await mkdir(join(existingPackDir, 'skills', 'old-skill'), { recursive: true });
    await writeFile(join(existingPackDir, 'skills', 'old-skill', 'SKILL.md'), '# OLD');
    await writeFile(
      join(existingPackDir, 'pack.yaml'),
      [
        'name: my-pack',
        'source: github:org/repo',
        'source_kind: github',
        'installed_at: 2026-01-01T00:00:00.000Z',
        'updated_at: 2026-01-01T00:00:00.000Z',
        'content_hash: sha256:0000000000000000000000000000000000000000000000000000000000000000',
        'features:',
        '  - skills',
        'pick:',
        '  skills:',
        '    - old-skill',
      ].join('\n'),
    );

    await installAsPack({
      canonicalDir,
      packName: 'my-pack',
      narrowed: emptyCanonical(),
      selected: { skillNames: [], ruleSlugs: [], commandNames: [], agentNames: [] },
      sourceForYaml: 'github:org/repo',
      sourceKind: 'github',
      entryFeatures: ['skills'],
      pick: { skills: ['new-skill'] },
    });

    expect(await exists(join(existingPackDir, 'skills', 'old-skill', 'SKILL.md'))).toBe(true);
    const packYaml = await readFile(join(existingPackDir, 'pack.yaml'), 'utf8');
    expect(packYaml).not.toContain('updated_at: 2026-01-01T00:00:00.000Z');
  });
});
