/**
 * A marketplace pack records one source path per sub-pack (`paths`). Refresh
 * rebuilds it like `install --sync`: the first path fresh, the rest merged
 * into the same pack name. It never fans out with `--all`, which would name
 * new packs after the old one and leave it behind.
 */
import { beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest';
import { createRunInstallForRefresh } from '../../../../src/install/refresh/refresh-install-bridge.js';
import type { InstallManifestEntry } from '../../../../src/install/core/install-manifest.js';

vi.mock('../../../../src/install/run/run-install.js', () => ({
  runInstall: vi.fn(),
}));

import { runInstall } from '../../../../src/install/run/run-install.js';

const mockRunInstall = runInstall as MockedFunction<typeof runInstall>;

describe('createRunInstallForRefresh — recorded paths', () => {
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

  it('rebuilds a marketplace pack (paths) from its first path, then merges the rest under its name', async () => {
    const entry: InstallManifestEntry = {
      name: 'composio-pack',
      source: 'github:org/repo',
      source_kind: 'github',
      features: ['skills'],
      paths: ['plugins/a', 'plugins/b'],
    };
    const fn = createRunInstallForRefresh({ projectRoot: '/tmp/x', scope: 'project' });
    await fn(entry, 'newsha');

    expect(mockRunInstall.mock.calls.map(([flags, args, root]) => [flags, args, root])).toEqual([
      [
        { force: true, forceFreshMaterialize: true, name: 'composio-pack', path: 'plugins/a' },
        ['github:org/repo@newsha'],
        '/tmp/x',
      ],
      [
        { force: true, name: 'composio-pack', path: 'plugins/b' },
        ['github:org/repo@newsha'],
        '/tmp/x',
      ],
    ]);
  });

  it('stops at the first failing marketplace path', async () => {
    mockRunInstall.mockResolvedValueOnce({
      exitCode: 1,
      data: { source: '', mode: 'install', installed: [], skipped: [], dryRun: false },
    });
    const entry: InstallManifestEntry = { ...baseEntry, paths: ['plugins/a', 'plugins/b'] };
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });

    await expect(fn(entry, 'newsha')).rejects.toThrow(/"my-pack" failed with exit code 1/);
    expect(mockRunInstall).toHaveBeenCalledOnce();
  });

  it('never sets all: a refresh replays only the recorded paths', async () => {
    const fn = createRunInstallForRefresh({ projectRoot: '/proj', scope: 'project' });
    await fn(baseEntry, 'newsha');

    const [flags] = mockRunInstall.mock.calls[0]!;
    expect(flags.all).toBeUndefined();
  });
});
