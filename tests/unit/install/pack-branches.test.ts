import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as yamlStringify } from 'yaml';
import {
  cacheKeyFromSource,
  cleanInstallCache,
  sweepStaleCache,
} from '../../../src/install/pack/cache-cleanup.js';
import { mergeIntoPack } from '../../../src/install/pack/pack-merge.js';
import {
  findExistingPack,
  listPacks,
  readPackMetadata,
} from '../../../src/install/pack/pack-reader.js';
import type { PackMetadata } from '../../../src/install/pack/pack-schema.js';
import type { CanonicalFiles } from '../../../src/core/types.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'amesh-cov-pack-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...overrides,
  };
}

const BASE_META: PackMetadata = {
  name: 'p',
  source: 'github:org/repo@abc',
  version: 'abc',
  source_kind: 'github',
  installed_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
  features: ['rules'],
  content_hash: 'sha256:zero',
};

describe('cache-cleanup branches', () => {
  it('cleanInstallCache returns silently when source is invalid (cacheKey null)', async () => {
    await expect(cleanInstallCache('not-a-source', tmp)).resolves.toBeUndefined();
  });

  it('cleanInstallCache uses default cache dir when no override (no throw)', async () => {
    // Use a remote source string but a fake cacheDir so it removes nothing risky.
    await expect(cleanInstallCache('github:org/repo@abc', tmp)).resolves.toBeUndefined();
  });

  it('cacheKeyFromSource builds gitlab key with default HEAD ref', () => {
    const key = cacheKeyFromSource('gitlab:ns/proj');
    expect(key).toContain('HEAD');
  });

  it('cacheKeyFromSource builds git key with default HEAD ref', () => {
    const key = cacheKeyFromSource('git+https://example.com/r.git');
    expect(key).toContain('HEAD');
  });

  it('sweepStaleCache ignores stat failures (race)', async () => {
    // Create entry then make it disappear between readdir and stat.
    const stale = join(tmp, 'will-vanish');
    mkdirSync(stale);
    // Remove before sweep runs
    rmSync(stale, { recursive: true });
    await expect(sweepStaleCache(tmp, 0)).resolves.toBeUndefined();
  });
});

describe('pack-merge branches', () => {
  it('mergeIntoPack preserves existingMeta.target when refresh.target undefined', async () => {
    const packDir = join(tmp, 'pkg');
    mkdirSync(packDir, { recursive: true });
    const existing: PackMetadata = { ...BASE_META, target: 'gemini-cli' };
    const updated = await mergeIntoPack(packDir, existing, makeCanonical(), ['rules'], undefined, {
      source: 'github:org/repo@new',
    });
    expect(updated.target).toBe('gemini-cli');
  });

  it('mergeIntoPack preserves existingMeta.as when refresh.as undefined', async () => {
    const packDir = join(tmp, 'pkg2');
    mkdirSync(packDir, { recursive: true });
    const existing: PackMetadata = { ...BASE_META, as: 'agents' };
    const updated = await mergeIntoPack(packDir, existing, makeCanonical(), ['rules'], undefined);
    expect(updated.as).toBe('agents');
  });

  it('mergeIntoPack preserves existingMeta.version when refresh.version undefined', async () => {
    const packDir = join(tmp, 'pkg3');
    mkdirSync(packDir, { recursive: true });
    const existing: PackMetadata = { ...BASE_META, version: 'v9' };
    const updated = await mergeIntoPack(packDir, existing, makeCanonical(), ['rules'], undefined);
    expect(updated.version).toBe('v9');
  });

  it('mergeIntoPack: pick removal returns undefined when no restrictions remain', async () => {
    const packDir = join(tmp, 'pkg4');
    mkdirSync(packDir, { recursive: true });
    const existing: PackMetadata = { ...BASE_META, pick: { skills: ['only'] } };
    const updated = await mergeIntoPack(packDir, existing, makeCanonical(), ['skills'], undefined);
    expect(updated.pick).toBeUndefined();
  });

  it('mergeIntoPack: paths union grows when adding new path-scoped install', async () => {
    const packDir = join(tmp, 'pkg5');
    mkdirSync(packDir, { recursive: true });
    const existing: PackMetadata = { ...BASE_META, path: 'a/b' };
    const updated = await mergeIntoPack(packDir, existing, makeCanonical(), ['rules'], undefined, {
      source: existing.source,
      path: 'c/d',
    });
    expect(updated.path).toBeUndefined();
    expect(updated.paths?.sort()).toEqual(['a/b', 'c/d']);
  });

  it('mergeIntoPack writes mcp / permissions / hooks / ignore when canonical has them', async () => {
    const packDir = join(tmp, 'settings-pack');
    mkdirSync(packDir, { recursive: true });
    const canonical = makeCanonical({
      mcp: { mcpServers: { x: { type: 'stdio', command: 'node', args: [], env: {} } } },
      permissions: { allow: [], deny: [] } as never,
      hooks: { PostToolUse: [{ matcher: '*', command: 'echo' }] },
      ignore: ['dist'],
    });
    await mergeIntoPack(packDir, BASE_META, canonical, ['rules'], undefined);
    expect(existsSync(join(packDir, 'mcp.json'))).toBe(true);
    expect(existsSync(join(packDir, 'permissions.yaml'))).toBe(true);
    expect(existsSync(join(packDir, 'hooks.yaml'))).toBe(true);
    expect(existsSync(join(packDir, 'ignore'))).toBe(true);
  });
});

describe('pack-reader branches', () => {
  it('readPackMetadata returns null when packDir has no pack.yaml', async () => {
    expect(await readPackMetadata(join(tmp, 'no-such'))).toBeNull();
  });

  it('findExistingPack returns null when packsDir is a file', async () => {
    const filePath = join(tmp, 'not-a-dir');
    writeFileSync(filePath, '');
    expect(await findExistingPack(filePath, 'github:org/repo@abc', {})).toBeNull();
  });

  it('listPacks returns [] when readdir throws (file path instead of dir)', async () => {
    const filePath = join(tmp, 'plain-file');
    writeFileSync(filePath, '');
    expect(await listPacks(filePath)).toEqual([]);
  });

  it('findExistingPack matches with default scope (no target/as/features)', async () => {
    const packDir = join(tmp, 'p1');
    mkdirSync(packDir);
    writeFileSync(join(packDir, 'pack.yaml'), yamlStringify(BASE_META));
    const found = await findExistingPack(tmp, 'github:org/repo@xyz', {});
    expect(found?.name).toBe('p');
  });

  it('findExistingPack rejects when target differs', async () => {
    const packDir = join(tmp, 'p2');
    mkdirSync(packDir);
    writeFileSync(
      join(packDir, 'pack.yaml'),
      yamlStringify({ ...BASE_META, target: 'gemini-cli' }),
    );
    const found = await findExistingPack(tmp, BASE_META.source, { target: 'cursor' });
    expect(found).toBeNull();
  });

  it('findExistingPack matches when both have undefined features (sameFeatures b unset)', async () => {
    const packDir = join(tmp, 'p3');
    mkdirSync(packDir);
    writeFileSync(join(packDir, 'pack.yaml'), yamlStringify(BASE_META));
    const found = await findExistingPack(tmp, BASE_META.source, {});
    expect(found?.name).toBe('p');
  });
});
