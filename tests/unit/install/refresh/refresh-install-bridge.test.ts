// tests/unit/install/refresh/refresh-install-bridge.test.ts
import { beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest';
import { createRunInstallForRefresh } from '../../../../src/install/refresh/refresh-install-bridge.js';
import type { InstallManifestEntry } from '../../../../src/install/core/install-manifest.js';

vi.mock('../../../../src/install/run/run-install.js', () => ({
  runInstall: vi.fn(),
}));

// Import the mocked runInstall after vi.mock is hoisted
import { runInstall } from '../../../../src/install/run/run-install.js';

const mockRunInstall = runInstall as MockedFunction<typeof runInstall>;

describe('createRunInstallForRefresh', () => {
  const baseEntry: InstallManifestEntry = {
    name: 'my-pack',
    source: 'github:org/repo@abc123',
    source_kind: 'github',
    version: 'abc123',
    features: ['skills'],
  };

  beforeEach(() => {
    mockRunInstall.mockReset();
    mockRunInstall.mockResolvedValue({
      exitCode: 0,
      data: { source: '', mode: 'install', installed: [], skipped: [], dryRun: false },
    });
  });

  it('returns a function', () => {
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    expect(typeof fn).toBe('function');
  });

  it('passes forceFreshMaterialize: true and force: true in flags', async () => {
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(baseEntry, 'newsha');

    expect(mockRunInstall).toHaveBeenCalledOnce();
    const [flags] = mockRunInstall.mock.calls[0]!;
    expect(flags.forceFreshMaterialize).toBe(true);
    expect(flags.force).toBe(true);
  });

  it('propagates entry target, as, path, and name to flags', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      target: 'claude-code',
      as: 'skills',
      path: 'skills/foo',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha');

    const [flags] = mockRunInstall.mock.calls[0]!;
    expect(flags.target).toBe('claude-code');
    expect(flags.as).toBe('skills');
    expect(flags.path).toBe('skills/foo');
    expect(flags.name).toBe('my-pack');
  });

  it('sets global: true when scope is global', async () => {
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'global' });
    await fn(baseEntry, 'newsha');

    const [flags] = mockRunInstall.mock.calls[0]!;
    expect(flags.global).toBe(true);
  });

  it('does not set global when scope is project', async () => {
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(baseEntry, 'newsha');

    const [flags] = mockRunInstall.mock.calls[0]!;
    expect(flags.global).toBeUndefined();
  });

  it('passes the replay scope with entry features and pick', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      features: ['skills', 'rules'],
      pick: { skills: ['foo-skill'] },
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha');

    const [, , , replay] = mockRunInstall.mock.calls[0]!;
    expect(replay?.features).toEqual(['skills', 'rules']);
    expect(replay?.pick).toEqual({ skills: ['foo-skill'] });
  });

  it('throws when runInstall returns non-zero exit code', async () => {
    mockRunInstall.mockResolvedValue({
      exitCode: 1,
      data: { source: '', mode: 'install', installed: [], skipped: [], dryRun: false },
    });

    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await expect(fn(baseEntry, 'newsha')).rejects.toThrow(
      /Install for refresh "my-pack" failed with exit code 1/,
    );
  });

  it('replaces the SHA in a github: source with newSha', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      source: 'github:org/repo@oldsha',
      source_kind: 'github',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha456');

    const [, args] = mockRunInstall.mock.calls[0]!;
    expect(args[0]).toBe('github:org/repo@newsha456');
  });

  it('appends @newSha to a bare github: source with no existing ref', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      source: 'github:org/repo',
      source_kind: 'github',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha456');

    const [, args] = mockRunInstall.mock.calls[0]!;
    expect(args[0]).toBe('github:org/repo@newsha456');
  });

  it('replaces the SHA in a gitlab: source with newSha', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      source: 'gitlab:org/repo@oldsha',
      source_kind: 'gitlab',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha456');

    const [, args] = mockRunInstall.mock.calls[0]!;
    expect(args[0]).toBe('gitlab:org/repo@newsha456');
  });

  it('appends @newSha to a bare gitlab: source with no existing ref', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      source: 'gitlab:org/repo',
      source_kind: 'gitlab',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha456');

    const [, args] = mockRunInstall.mock.calls[0]!;
    expect(args[0]).toBe('gitlab:org/repo@newsha456');
  });

  it('replaces the SHA fragment in a git+ source with newSha', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      source: 'git+https://example.com/repo.git#oldsha',
      source_kind: 'git',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha456');

    const [, args] = mockRunInstall.mock.calls[0]!;
    expect(args[0]).toBe('git+https://example.com/repo.git#newsha456');
  });

  it('appends #newSha to a git+ source with no existing fragment', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      source: 'git+https://example.com/repo.git',
      source_kind: 'git',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha456');

    const [, args] = mockRunInstall.mock.calls[0]!;
    expect(args[0]).toBe('git+https://example.com/repo.git#newsha456');
  });

  it('falls back to entry.source when source cannot be parsed', async () => {
    const entry: InstallManifestEntry = {
      ...baseEntry,
      source: 'local:./some-pack',
      source_kind: 'local',
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(entry, 'newsha456');

    const [, args] = mockRunInstall.mock.calls[0]!;
    expect(args[0]).toBe('local:./some-pack');
  });
});
