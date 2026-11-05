import { describe, it, expect, vi } from 'vitest';
import {
  runInstallMarketplace,
  type MarketplaceExecutor,
} from '../../../../src/install/run/run-install-marketplace.js';
import { createInstallReport } from '../../../../src/install/core/install-report.js';
import type { InstallTarget } from '../../../../src/install/core/install-target.js';

function makeTarget(name: string, path: string): InstallTarget {
  return { name, source: 'github:test/repo@abc', path, features: ['skills'] };
}

describe('runInstallMarketplace', () => {
  it('all-success: exit 0, all installed', async () => {
    const executor: MarketplaceExecutor = vi.fn().mockResolvedValue({
      installed: [{ kind: 'skill', name: 'a', path: 'pack' }],
      skipped: [],
    });
    const report = createInstallReport();
    const targets = [makeTarget('t1', 'plugins/a'), makeTarget('t2', 'plugins/b')];

    const result = await runInstallMarketplace(targets, executor, report);
    expect(result.exitCode).toBe(0);
    expect(result.installed).toHaveLength(2);
    expect(report.subPackFailures).toHaveLength(0);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('partial-success: exit 0, failures recorded', async () => {
    let callCount = 0;
    const executor: MarketplaceExecutor = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 2) return Promise.reject(new Error('bad frontmatter'));
      return Promise.resolve({ installed: [{ kind: 'skill', name: 'x', path: 'p' }], skipped: [] });
    });
    const report = createInstallReport();
    const targets = [
      makeTarget('t1', 'plugins/a'),
      makeTarget('t2', 'plugins/b'),
      makeTarget('t3', 'plugins/c'),
    ];

    const result = await runInstallMarketplace(targets, executor, report);
    expect(result.exitCode).toBe(0);
    expect(result.installed).toHaveLength(2);
    expect(report.subPackFailures).toHaveLength(1);
    expect(report.subPackFailures[0].name).toBe('t2');
    expect(report.subPackFailures[0].error).toContain('bad frontmatter');
  });

  it('all-failure: exit 1', async () => {
    const executor: MarketplaceExecutor = vi.fn().mockRejectedValue(new Error('fail'));
    const report = createInstallReport();
    const targets = [makeTarget('t1', 'plugins/a'), makeTarget('t2', 'plugins/b')];

    const result = await runInstallMarketplace(targets, executor, report);
    expect(result.exitCode).toBe(1);
    expect(result.installed).toHaveLength(0);
    expect(report.subPackFailures).toHaveLength(2);
  });

  it('single-target: short-circuits with exit 0', async () => {
    const executor: MarketplaceExecutor = vi.fn().mockResolvedValue({
      installed: [{ kind: 'agent', name: 'bot', path: 'pack' }],
      skipped: [],
    });
    const report = createInstallReport();
    const targets = [makeTarget('t1', 'plugins/only')];

    const result = await runInstallMarketplace(targets, executor, report);
    expect(result.exitCode).toBe(0);
    expect(result.installed).toHaveLength(1);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('keeps skippedSettings from the last sub-pack that installed', async () => {
    const first = [{ feature: 'mcp' as const, items: ['a'] }];
    const executor: MarketplaceExecutor = vi
      .fn()
      .mockResolvedValueOnce({ installed: [], skipped: [], skippedSettings: first })
      .mockRejectedValueOnce(new Error('fail'));
    const targets = [makeTarget('t1', 'plugins/a'), makeTarget('t2', 'plugins/b')];

    const result = await runInstallMarketplace(targets, executor, createInstallReport());

    expect(result.skippedSettings).toEqual(first);
  });

  it('drops skippedSettings when the last sub-pack that installed skipped none', async () => {
    const executor: MarketplaceExecutor = vi
      .fn()
      .mockResolvedValueOnce({
        installed: [],
        skipped: [],
        skippedSettings: [{ feature: 'mcp', items: ['a'] }],
      })
      .mockResolvedValueOnce({ installed: [], skipped: [] });
    const targets = [makeTarget('t1', 'plugins/a'), makeTarget('t2', 'plugins/b')];

    const result = await runInstallMarketplace(targets, executor, createInstallReport());

    expect(result).not.toHaveProperty('skippedSettings');
  });
});
