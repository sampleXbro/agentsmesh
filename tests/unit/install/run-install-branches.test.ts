import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanonicalFiles } from '../../../src/core/types.js';

// ---------- run-install-pack mocks ----------
const mockMaterializePack = vi.hoisted(() => vi.fn());
const mockFindExistingPack = vi.hoisted(() => vi.fn());
const mockReadPackMetadata = vi.hoisted(() => vi.fn());
const mockMergeIntoPack = vi.hoisted(() => vi.fn());
const mockCleanInstallCache = vi.hoisted(() => vi.fn());
const mockUpsertInstallManifestEntry = vi.hoisted(() => vi.fn());
const mockBuildInstallManifestEntry = vi.hoisted(() => vi.fn());
const mockRename = vi.hoisted(() => vi.fn());

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
  readInstallManifest: vi.fn().mockResolvedValue([]),
}));
vi.mock('node:fs/promises', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, rename: mockRename };
});

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
  canonicalDir: '/p/.agentsmesh',
  packName: 'auto-name',
  narrowed: emptyCanonical(),
  selected: { skillNames: [], ruleSlugs: [], commandNames: [], agentNames: [] },
  sourceForYaml: 'github:org/repo@abc',
  version: 'abc',
  sourceKind: 'github' as const,
  entryFeatures: ['skills'] as ['skills'],
  pick: undefined,
  yamlTarget: undefined,
  pathInRepo: undefined,
  manualAs: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMaterializePack.mockResolvedValue({ name: 'auto-name' });
  mockFindExistingPack.mockResolvedValue(null);
  mockReadPackMetadata.mockResolvedValue(null);
  mockMergeIntoPack.mockResolvedValue({
    name: 'auto-name',
    features: ['skills'],
    pick: undefined,
  });
  mockCleanInstallCache.mockResolvedValue(undefined);
  mockUpsertInstallManifestEntry.mockResolvedValue(undefined);
  mockBuildInstallManifestEntry.mockImplementation((entry) => entry);
  mockRename.mockResolvedValue(undefined);
});

describe('installAsPack — branches', () => {
  it('throws when materialize would collide with an existing incompatible pack', async () => {
    mockReadPackMetadata.mockResolvedValueOnce({ name: 'auto-name' });
    await expect(installAsPack(baseArgs)).rejects.toThrow(/collides with an existing/);
    expect(mockMaterializePack).not.toHaveBeenCalled();
  });

  it('merges a picked subset into the existing pack under its own name', async () => {
    const pick = { skills: ['s1'] };
    mockFindExistingPack.mockResolvedValueOnce({
      meta: { name: 'old-name', features: ['skills'], pick },
      packDir: '/p/.agentsmesh/packs/old-name',
      name: 'old-name',
    });
    mockMergeIntoPack.mockResolvedValueOnce({ name: 'old-name', features: ['skills'], pick });
    await expect(installAsPack({ ...baseArgs, pick })).resolves.toBe('old-name');
    expect(mockMergeIntoPack.mock.calls[0]?.[0]).toBe('/p/.agentsmesh/packs/old-name');
    expect(mockRename).not.toHaveBeenCalled();
  });

  it('replaces the pack under its own name when a whole-source install re-runs', async () => {
    mockFindExistingPack.mockResolvedValueOnce({
      meta: { name: 'old-name', features: ['skills'], installed_at: 'first' },
      packDir: '/p/.agentsmesh/packs/old-name',
      name: 'old-name',
    });
    await expect(installAsPack(baseArgs)).resolves.toBe('old-name');
    expect(mockRename).not.toHaveBeenCalled();
    expect(mockMergeIntoPack).not.toHaveBeenCalled();
    expect(mockMaterializePack).toHaveBeenCalledOnce();
    const [, name, , meta] = mockMaterializePack.mock.calls[0] as [
      unknown,
      string,
      unknown,
      { installed_at: string },
    ];
    expect(name).toBe('old-name');
    expect(meta.installed_at).toBe('first');
  });

  it('resolves the pack it would update in dry-run, and writes nothing', async () => {
    mockFindExistingPack.mockResolvedValueOnce({
      meta: { name: 'old-name', features: ['skills'] },
      packDir: '/p/.agentsmesh/packs/old-name',
      name: 'old-name',
    });
    await expect(installAsPack({ ...baseArgs, dryRun: true })).resolves.toBe('old-name');
    expect(mockMaterializePack).not.toHaveBeenCalled();
    expect(mockMergeIntoPack).not.toHaveBeenCalled();
    expect(mockUpsertInstallManifestEntry).not.toHaveBeenCalled();
    expect(mockCleanInstallCache).not.toHaveBeenCalled();
  });

  it('reports a pack name collision in dry-run too', async () => {
    mockReadPackMetadata.mockResolvedValueOnce({ name: 'auto-name' });
    await expect(installAsPack({ ...baseArgs, dryRun: true })).rejects.toThrow(
      /collides with an existing/,
    );
  });

  it('passes pathInRepo=undefined to materialize as path:undefined,paths:undefined', async () => {
    await installAsPack({ ...baseArgs, pathInRepo: undefined });
    const [, , , metadata] = mockMaterializePack.mock.calls[0] as unknown[];
    expect((metadata as Record<string, unknown>).path).toBeUndefined();
    expect((metadata as Record<string, unknown>).paths).toBeUndefined();
  });
});

// ---------- run-install-execute coverage ----------
describe('executeRunInstallPoolsAndWrite — dry-run pack branch', () => {
  // We mock heavy dependencies to exercise dry-run path with default install (not extends).
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns early in dry-run when not using extends and not actually writing pack', async () => {
    vi.doMock('../../../src/canonical/extends/extends.js', () => ({
      loadCanonicalWithExtends: vi.fn().mockResolvedValue({
        canonical: emptyCanonical(),
        resolvedExtends: [],
      }),
    }));
    vi.doMock('../../../src/install/core/install-conflicts.js', () => ({
      resolveInstallConflicts: vi.fn().mockResolvedValue({
        skillNames: [],
        ruleSlugs: [],
        commandNames: [],
        agentNames: [],
      }),
    }));
    vi.doMock('../../../src/install/core/install-extend-entry.js', () => ({
      writeInstallAsExtend: vi.fn(),
    }));
    const installAsPack = vi.fn().mockResolvedValue('existing-pack');
    vi.doMock('../../../src/install/run/run-install-pack.js', () => ({ installAsPack }));
    vi.doMock('../../../src/cli/commands/generate.js', () => ({
      runGenerate: vi.fn().mockResolvedValue({
        exitCode: 0,
        data: {
          scope: 'project',
          mode: 'generate',
          files: [],
          summary: { created: 0, updated: 0, unchanged: 0 },
        },
      }),
    }));
    vi.doMock('../../../src/cli/renderers/generate.js', () => ({
      renderGenerate: vi.fn(),
    }));
    const loggerInfo = vi.fn();
    const loggerWarn = vi.fn();
    vi.doMock('../../../src/utils/output/logger.js', () => ({
      logger: { info: loggerInfo, warn: loggerWarn, success: vi.fn() },
    }));
    vi.doMock('../../../src/install/core/pool-resolution.js', () => ({
      hasInstallableResources: () => true,
      resolveSkillPool: vi
        .fn()
        .mockResolvedValue([
          { source: '/s/SKILL.md', name: 'demo', description: '', body: '', supportingFiles: [] },
        ]),
      resolveRulePool: vi.fn().mockResolvedValue([]),
      resolveCommandPool: vi.fn().mockResolvedValue([]),
      resolveAgentPool: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('../../../src/install/core/install-entry-selection.js', () => ({
      buildInstallPick: vi.fn(),
      deriveInstallFeatures: vi.fn().mockReturnValue(['skills']),
      ensureInstallSelection: vi.fn(),
      pickForSelectedResources: vi.fn().mockReturnValue(undefined),
    }));
    vi.doMock('../../../src/install/core/install-name.js', () => ({
      selectInstallEntryName: vi.fn().mockReturnValue('demo-pack'),
      findExistingInstallName: vi.fn().mockReturnValue(null),
    }));
    vi.doMock('../../../src/install/run/install-replay.js', () => ({
      applyReplayInstallScope: vi.fn().mockImplementation((narrowed, features) => ({
        narrowed,
        discoveredFeatures: features,
      })),
    }));

    const mod = await import('../../../src/install/run/run-install-execute.js');

    const args = {
      scope: 'project' as const,
      force: true,
      dryRun: true,
      tty: false,
      useExtends: false,
      nameOverride: '',
      explicitAs: undefined,
      acceptHooks: false,
      acceptPermissions: false,
      acceptMcp: false,
      config: {
        version: 1,
        targets: ['claude-code'],
        features: ['skills'],
        extends: [],
        overrides: {},
      } as never,
      context: { configDir: '/p', canonicalDir: '/p/.agentsmesh', rootBase: '/p' },
      parsed: { kind: 'github', org: 'org', repo: 'repo' } as never,
      sourceForYaml: 'github:org/repo@abc',
      version: 'abc',
      pathInRepo: '',
      contentRoot: '/s',
      persisted: { pathInRepo: undefined, pick: undefined },
      replay: undefined,
      prep: { yamlTarget: undefined } as never,
      implicitPick: undefined,
      narrowed: emptyCanonical({
        skills: [
          { source: '/s/SKILL.md', name: 'demo', description: '', body: '', supportingFiles: [] },
        ],
      }),
      discoveredFeatures: ['skills'],
    };
    const result = await mod.executeRunInstallPoolsAndWrite(args);
    expect(installAsPack).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(loggerInfo).toHaveBeenCalledWith(
      '[dry-run] Would install pack "existing-pack" to .agentsmesh/packs/.',
    );
    expect(result.installed).toEqual([{ kind: 'skill', name: 'demo', path: 'existing-pack' }]);
  });

  it('warns when generate fails after install', async () => {
    vi.doMock('../../../src/canonical/extends/extends.js', () => ({
      loadCanonicalWithExtends: vi.fn().mockResolvedValue({
        canonical: emptyCanonical(),
        resolvedExtends: [],
      }),
    }));
    vi.doMock('../../../src/install/core/install-conflicts.js', () => ({
      resolveInstallConflicts: vi.fn().mockResolvedValue({
        skillNames: ['demo'],
        ruleSlugs: [],
        commandNames: [],
        agentNames: [],
      }),
    }));
    vi.doMock('../../../src/install/core/install-extend-entry.js', () => ({
      writeInstallAsExtend: vi.fn(),
    }));
    vi.doMock('../../../src/install/run/run-install-pack.js', () => ({
      installAsPack: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../../../src/cli/commands/generate.js', () => ({
      runGenerate: vi.fn().mockResolvedValue({
        exitCode: 1,
        data: {
          scope: 'project',
          mode: 'generate',
          files: [],
          summary: { created: 0, updated: 0, unchanged: 0 },
        },
      }),
    }));
    vi.doMock('../../../src/cli/renderers/generate.js', () => ({
      renderGenerate: vi.fn(),
    }));
    const loggerWarn = vi.fn();
    vi.doMock('../../../src/utils/output/logger.js', () => ({
      logger: { info: vi.fn(), warn: loggerWarn, success: vi.fn() },
    }));
    vi.doMock('../../../src/install/core/pool-resolution.js', () => ({
      hasInstallableResources: () => true,
      resolveSkillPool: vi
        .fn()
        .mockResolvedValue([
          { source: '/s/SKILL.md', name: 'demo', description: '', body: '', supportingFiles: [] },
        ]),
      resolveRulePool: vi.fn().mockResolvedValue([]),
      resolveCommandPool: vi.fn().mockResolvedValue([]),
      resolveAgentPool: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('../../../src/install/core/install-entry-selection.js', () => ({
      buildInstallPick: vi.fn(),
      deriveInstallFeatures: vi.fn().mockReturnValue(['skills']),
      ensureInstallSelection: vi.fn(),
      pickForSelectedResources: vi.fn().mockReturnValue(undefined),
    }));
    vi.doMock('../../../src/install/core/install-name.js', () => ({
      selectInstallEntryName: vi.fn().mockReturnValue('demo-pack'),
      findExistingInstallName: vi.fn().mockReturnValue(null),
    }));
    vi.doMock('../../../src/install/run/install-replay.js', () => ({
      applyReplayInstallScope: vi.fn().mockImplementation((narrowed, features) => ({
        narrowed,
        discoveredFeatures: features,
      })),
    }));

    const mod = await import('../../../src/install/run/run-install-execute.js');

    const args = {
      scope: 'global' as const,
      force: true,
      dryRun: false,
      tty: false,
      useExtends: false,
      nameOverride: '',
      explicitAs: undefined,
      acceptHooks: false,
      acceptPermissions: false,
      acceptMcp: false,
      config: {
        version: 1,
        targets: ['claude-code'],
        features: ['skills'],
        extends: [],
        overrides: {},
      } as never,
      context: {
        configDir: '/home/.agentsmesh',
        canonicalDir: '/home/.agentsmesh',
        rootBase: '/home',
      },
      parsed: { kind: 'github', org: 'org', repo: 'repo' } as never,
      sourceForYaml: 'github:org/repo@abc',
      version: 'abc',
      pathInRepo: '',
      contentRoot: '/s',
      persisted: { pathInRepo: undefined, pick: undefined },
      replay: undefined,
      prep: { yamlTarget: undefined } as never,
      implicitPick: undefined,
      narrowed: emptyCanonical({
        skills: [
          { source: '/s/SKILL.md', name: 'demo', description: '', body: '', supportingFiles: [] },
        ],
      }),
      discoveredFeatures: ['skills'],
    };
    await mod.executeRunInstallPoolsAndWrite(args);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('agentsmesh generate --global'),
    );
  });

  it('throws when narrowed has no installable resources (with implicitPick message branch)', async () => {
    vi.doMock('../../../src/install/core/pool-resolution.js', () => ({
      hasInstallableResources: () => false,
      resolveSkillPool: vi.fn(),
      resolveRulePool: vi.fn(),
      resolveCommandPool: vi.fn(),
      resolveAgentPool: vi.fn(),
    }));
    vi.doMock('../../../src/install/run/install-replay.js', () => ({
      applyReplayInstallScope: vi.fn().mockImplementation((narrowed, features) => ({
        narrowed,
        discoveredFeatures: features,
      })),
    }));

    const mod = await import('../../../src/install/run/run-install-execute.js');

    const args = {
      scope: 'project' as const,
      force: true,
      dryRun: false,
      tty: false,
      useExtends: false,
      nameOverride: '',
      explicitAs: undefined,
      acceptHooks: false,
      acceptPermissions: false,
      acceptMcp: false,
      config: {} as never,
      context: { configDir: '/p', canonicalDir: '/p/.agentsmesh', rootBase: '/p' },
      parsed: {} as never,
      sourceForYaml: 'github:org/repo@abc',
      version: 'abc',
      pathInRepo: '',
      contentRoot: '/s',
      persisted: { pathInRepo: undefined, pick: undefined },
      replay: undefined,
      prep: { yamlTarget: undefined } as never,
      implicitPick: { skills: ['x'] } as never,
      narrowed: emptyCanonical(),
      discoveredFeatures: [],
    };

    await expect(mod.executeRunInstallPoolsAndWrite(args)).rejects.toThrow(
      /No resources match the install path or implicit selection/,
    );
  });
});
