import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDetectLayout = vi.hoisted(() => vi.fn());
const mockAggregateAnthropicSkillPack = vi.hoisted(() => vi.fn());
const mockResolveDiscoveredForInstall = vi.hoisted(() => vi.fn());
const mockResolveManualDiscoveredForInstall = vi.hoisted(() => vi.fn());
const mockParseSkillDirectory = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/install/classify/layout-detect.js', () => ({
  detectLayout: mockDetectLayout,
}));
vi.mock('../../../../src/sources/anthropic-skill-pack/aggregate.js', () => ({
  aggregateAnthropicSkillPack: mockAggregateAnthropicSkillPack,
}));
vi.mock('../../../../src/canonical/features/skills.js', () => ({
  parseSkillDirectory: mockParseSkillDirectory,
}));
vi.mock('../../../../src/install/run/run-install-discovery.js', () => ({
  resolveDiscoveredForInstall: mockResolveDiscoveredForInstall,
}));
vi.mock('../../../../src/install/manual/manual-install-discovery.js', () => ({
  resolveManualDiscoveredForInstall: mockResolveManualDiscoveredForInstall,
}));
import { resolveInstallDiscovery } from '../../../../src/install/core/install-discovery.js';
import type { SourceLayout } from '../../../../src/install/classify/layout-types.js';

function emptyLayout(): SourceLayout {
  return {
    canonical: null,
    skillPack: null,
    rootSkill: null,
    rootRule: null,
    flatCollections: [],
    toolNativeManifests: [],
    subPacks: [],
  };
}

function nativeReturn(): unknown {
  return {
    prep: { discoveryRoot: '/content', importHappened: false },
    implicitPick: undefined,
    narrowed: {
      rules: [],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    },
    discoveredFeatures: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveDiscoveredForInstall.mockResolvedValue(nativeReturn());
  mockResolveManualDiscoveredForInstall.mockResolvedValue({
    prep: { discoveryRoot: '/content', importHappened: false },
    narrowed: (nativeReturn() as { narrowed: unknown }).narrowed,
    discoveredFeatures: [],
  });
});

describe('resolveInstallDiscovery — layout-based dispatch', () => {
  it('skips layout detection and routes to manual path when --as is set', async () => {
    await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
      explicitAs: 'skills',
    });
    expect(mockDetectLayout).not.toHaveBeenCalled();
    expect(mockResolveManualDiscoveredForInstall).toHaveBeenCalledOnce();
    expect(mockResolveDiscoveredForInstall).not.toHaveBeenCalled();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
  });

  it('skips layout detection and routes to native path when --target is set', async () => {
    await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
      explicitTarget: 'claude-code',
    });
    expect(mockDetectLayout).not.toHaveBeenCalled();
    expect(mockResolveDiscoveredForInstall).toHaveBeenCalledOnce();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
  });

  it('routes to native path when layout has canonical', async () => {
    mockDetectLayout.mockResolvedValue({
      ...emptyLayout(),
      canonical: { path: '.agentsmesh' },
    });
    await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });
    expect(mockDetectLayout).toHaveBeenCalledWith('/content');
    expect(mockResolveDiscoveredForInstall).toHaveBeenCalledOnce();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
  });

  it('routes to native path when layout is empty (unknown)', async () => {
    mockDetectLayout.mockResolvedValue(emptyLayout());
    await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });
    expect(mockResolveDiscoveredForInstall).toHaveBeenCalledOnce();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
  });

  it('routes to aggregator when layout has skillPack', async () => {
    mockDetectLayout.mockResolvedValue({
      ...emptyLayout(),
      skillPack: { path: 'skills' },
    });
    mockAggregateAnthropicSkillPack.mockResolvedValue({
      skills: [
        {
          name: 'tdd',
          source: '/content/skills/tdd/SKILL.md',
          description: '',
          body: '',
          supportingFiles: [],
        },
      ],
      agents: [],
      commands: [],
      rules: [],
      dedups: [],
      brokenLinks: [],
    });

    const result = await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });

    expect(mockResolveDiscoveredForInstall).not.toHaveBeenCalled();
    expect(mockAggregateAnthropicSkillPack).toHaveBeenCalledOnce();
    expect(result.layout?.skillPack).toEqual({ path: 'skills' });
    expect(result.aggregate).toBeDefined();
    expect(result.narrowed.skills).toHaveLength(1);
    expect(result.narrowed.skills[0]?.name).toBe('tdd');
    expect(result.discoveredFeatures).toEqual(['skills']);
  });

  it('skillPack with toolNativeManifests still routes to aggregator', async () => {
    mockDetectLayout.mockResolvedValue({
      ...emptyLayout(),
      skillPack: { path: 'skills' },
      toolNativeManifests: [{ path: '.claude-plugin' }],
    });
    mockAggregateAnthropicSkillPack.mockResolvedValue({
      skills: [],
      agents: [],
      commands: [],
      rules: [],
      dedups: [],
      brokenLinks: [],
    });

    await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });

    expect(mockAggregateAnthropicSkillPack).toHaveBeenCalledOnce();
    expect(mockResolveDiscoveredForInstall).not.toHaveBeenCalled();
  });

  it('preserves --target override even when layout has skillPack', async () => {
    await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
      explicitTarget: 'claude-code',
    });
    expect(mockDetectLayout).not.toHaveBeenCalled();
    expect(mockResolveDiscoveredForInstall).toHaveBeenCalledOnce();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
  });

  it('routes to root-skill aggregator when layout has rootSkill', async () => {
    mockDetectLayout.mockResolvedValue({
      ...emptyLayout(),
      rootSkill: { path: 'SKILL.md' },
    });
    mockParseSkillDirectory.mockResolvedValue({
      name: 'humanizer',
      source: '/content/SKILL.md',
      description: 'remove ai writing',
      body: 'body',
      supportingFiles: [],
    });

    const result = await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });

    expect(mockResolveDiscoveredForInstall).not.toHaveBeenCalled();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
    expect(mockParseSkillDirectory).toHaveBeenCalledWith('/content', {});
    expect(result.narrowed.skills).toHaveLength(1);
    expect(result.narrowed.skills[0]?.name).toBe('humanizer');
    expect(result.discoveredFeatures).toEqual(['skills']);
    expect(result.layout?.rootSkill).toEqual({ path: 'SKILL.md' });
  });

  it('routes to root-rule path when layout has only rootRule (legacy .cursorrules)', async () => {
    mockDetectLayout.mockResolvedValue({
      ...emptyLayout(),
      rootRule: { path: '.cursorrules' },
    });

    const result = await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });

    // rootRule dispatch reads the file directly — neither the native nor the
    // aggregator/parseSkillDirectory paths should run.
    expect(mockResolveDiscoveredForInstall).not.toHaveBeenCalled();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
    expect(mockParseSkillDirectory).not.toHaveBeenCalled();
    expect(result.layout?.rootRule).toEqual({ path: '.cursorrules' });
  });

  it('skillPack precedence — rootSkill ignored when both set', async () => {
    mockDetectLayout.mockResolvedValue({
      ...emptyLayout(),
      skillPack: { path: 'skills' },
      rootSkill: { path: 'SKILL.md' },
    });
    mockAggregateAnthropicSkillPack.mockResolvedValue({
      skills: [],
      agents: [],
      commands: [],
      rules: [],
      dedups: [],
      brokenLinks: [],
    });
    await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });
    expect(mockAggregateAnthropicSkillPack).toHaveBeenCalledOnce();
    expect(mockParseSkillDirectory).not.toHaveBeenCalled();
  });

  it('returns empty canonical with layout when sub-packs exist but no root content', async () => {
    const layout: SourceLayout = {
      ...emptyLayout(),
      subPacks: [
        {
          path: 'plugins/alpha',
          layout: { ...emptyLayout(), skillPack: { path: 'plugins/alpha/skills' } },
        },
        {
          path: 'plugins/beta',
          layout: { ...emptyLayout(), skillPack: { path: 'plugins/beta/skills' } },
        },
      ],
    };
    mockDetectLayout.mockResolvedValue(layout);
    const result = await resolveInstallDiscovery({
      resolvedPath: '/repo',
      contentRoot: '/content',
      pathInRepo: '',
    });
    expect(mockResolveDiscoveredForInstall).not.toHaveBeenCalled();
    expect(mockAggregateAnthropicSkillPack).not.toHaveBeenCalled();
    expect(result.layout?.subPacks).toHaveLength(2);
    expect(result.discoveredFeatures).toEqual([]);
  });
});
