import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanonicalFiles } from '../../../src/core/types.js';

const mockMaterializePack = vi.hoisted(() => vi.fn());
const mockFindExistingPack = vi.hoisted(() => vi.fn());
const mockReadPackMetadata = vi.hoisted(() => vi.fn());
const mockMergeIntoPack = vi.hoisted(() => vi.fn());
const mockCleanInstallCache = vi.hoisted(() => vi.fn());
const mockUpsertInstallManifestEntry = vi.hoisted(() => vi.fn());
const mockBuildInstallManifestEntry = vi.hoisted(() => vi.fn());

vi.mock('../../../src/install/pack/pack-writer.js', () => ({
  materializePack: mockMaterializePack,
}));
vi.mock('../../../src/install/pack/pack-reader.js', () => ({
  findExistingPack: mockFindExistingPack,
  findPacksBySource: async (): Promise<never[]> => [],
  readPackMetadata: mockReadPackMetadata,
}));
vi.mock('../../../src/install/pack/pack-merge.js', () => ({
  mergeIntoPack: mockMergeIntoPack,
}));
vi.mock('../../../src/install/pack/cache-cleanup.js', () => ({
  cleanInstallCache: mockCleanInstallCache,
}));
vi.mock('../../../src/install/core/install-manifest.js', () => ({
  upsertInstallManifestEntry: mockUpsertInstallManifestEntry,
  buildInstallManifestEntry: mockBuildInstallManifestEntry,
}));

import { installAsPack } from '../../../src/install/run/run-install-pack.js';

function emptyCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
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

const baseArgs = {
  canonicalDir: '/project/.agentsmesh',
  packName: 'my-pack',
  narrowed: emptyCanonical(),
  selected: { skillNames: [], ruleSlugs: [], commandNames: [], agentNames: [] },
  sourceForYaml: 'github:org/repo@abc123',
  version: 'abc123',
  sourceKind: 'github' as const,
  entryFeatures: ['skills'] as ['skills'],
  pick: undefined,
  yamlTarget: undefined,
  pathInRepo: undefined,
  manualAs: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMaterializePack.mockResolvedValue({ name: 'my-pack', content_hash: 'sha256:abc' });
  mockFindExistingPack.mockResolvedValue(null);
  mockReadPackMetadata.mockResolvedValue(null);
  mockMergeIntoPack.mockResolvedValue({ name: 'my-pack', features: ['skills'], pick: undefined });
  mockCleanInstallCache.mockResolvedValue(undefined);
  mockUpsertInstallManifestEntry.mockResolvedValue(undefined);
  mockBuildInstallManifestEntry.mockImplementation((entry) => entry);
});

describe('installAsPack', () => {
  // `path.join` produces native separators on Windows; match either form.
  const packsDirPattern = /[\\/]project[\\/]\.agentsmesh[\\/]packs$/;

  it('calls materializePack when no existing pack', async () => {
    await installAsPack(baseArgs);
    expect(mockMaterializePack).toHaveBeenCalledOnce();
    const [packsDir, packName] = mockMaterializePack.mock.calls[0] as unknown[];
    expect(typeof packsDir === 'string' && packsDirPattern.test(packsDir)).toBe(true);
    expect(packName).toBe('my-pack');
  });

  it('calls findExistingPack with correct packsDir and source', async () => {
    await installAsPack(baseArgs);
    expect(mockFindExistingPack).toHaveBeenCalledWith(
      expect.stringMatching(packsDirPattern),
      'github:org/repo@abc123',
      { target: undefined, as: undefined, features: ['skills'] },
    );
  });

  it('calls mergeIntoPack instead when existing pack found', async () => {
    const existingMeta = {
      ...baseArgs,
      name: 'my-pack',
      source: 'github:org/repo@old123',
      version: 'old123',
      content_hash: 'old',
    };
    mockFindExistingPack.mockResolvedValue({
      meta: existingMeta,
      packDir: '/project/.agentsmesh/packs/my-pack',
      name: 'my-pack',
    });

    await installAsPack({
      ...baseArgs,
      sourceForYaml: 'github:org/repo@new456',
      version: 'new456',
      yamlTarget: 'gemini-cli',
      pathInRepo: '.gemini/commands',
    });
    expect(mockMergeIntoPack).toHaveBeenCalledOnce();
    expect(mockMaterializePack).not.toHaveBeenCalled();
    expect(mockMergeIntoPack).toHaveBeenCalledWith(
      '/project/.agentsmesh/packs/my-pack',
      existingMeta,
      expect.any(Object),
      ['skills'],
      undefined,
      {
        source: 'github:org/repo@new456',
        version: 'new456',
        target: 'gemini-cli',
        path: '.gemini/commands',
      },
      [],
    );
  });

  it('passes manual --as through to pack lookup and metadata refresh', async () => {
    await installAsPack({ ...baseArgs, manualAs: 'agents' });

    expect(mockFindExistingPack).toHaveBeenCalledWith(
      expect.stringMatching(packsDirPattern),
      baseArgs.sourceForYaml,
      {
        target: undefined,
        as: 'agents',
        features: ['skills'],
      },
    );
    const [, , , metadata] = mockMaterializePack.mock.calls[0] as unknown[];
    expect((metadata as Record<string, unknown>).as).toBe('agents');
  });

  it('calls cleanInstallCache for github source', async () => {
    await installAsPack(baseArgs);
    expect(mockCleanInstallCache).toHaveBeenCalledWith('github:org/repo@abc123');
  });

  it('updates the install manifest after materializing a pack', async () => {
    await installAsPack(baseArgs);
    expect(mockUpsertInstallManifestEntry).toHaveBeenCalledWith(
      '/project/.agentsmesh',
      expect.objectContaining({
        name: 'my-pack',
        source: 'github:org/repo@abc123',
        sourceKind: 'github',
        features: ['skills'],
        path: undefined,
        paths: undefined,
      }),
    );
  });

  it('does not call cleanInstallCache for local source', async () => {
    await installAsPack({
      ...baseArgs,
      sourceKind: 'local',
      sourceForYaml: '../local/path',
    });
    expect(mockCleanInstallCache).not.toHaveBeenCalled();
  });

  it('filters narrowed canonical to only selected skills', async () => {
    const skill1 = {
      source: '/s1/SKILL.md',
      name: 'skill-a',
      description: '',
      body: '',
      supportingFiles: [],
    };
    const skill2 = {
      source: '/s2/SKILL.md',
      name: 'skill-b',
      description: '',
      body: '',
      supportingFiles: [],
    };
    const narrowed = emptyCanonical({ skills: [skill1, skill2] });

    await installAsPack({
      ...baseArgs,
      narrowed,
      selected: { ...baseArgs.selected, skillNames: ['skill-a'] },
    });

    const [, , canonical] = mockMaterializePack.mock.calls[0] as unknown[];
    expect((canonical as CanonicalFiles).skills).toHaveLength(1);
    expect((canonical as CanonicalFiles).skills[0]?.name).toBe('skill-a');
  });

  it('passes version and pick to materializePack metadata', async () => {
    const pick = { skills: ['skill-a'] };
    await installAsPack({ ...baseArgs, pick });
    const [, , , metadata] = mockMaterializePack.mock.calls[0] as unknown[];
    expect((metadata as Record<string, unknown>).version).toBe('abc123');
    expect((metadata as Record<string, unknown>).pick).toEqual(pick);
  });
});
