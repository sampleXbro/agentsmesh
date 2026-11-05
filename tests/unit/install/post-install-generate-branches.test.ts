/**
 * Branch coverage for `runPostOperationGenerate` in
 * `src/install/run/post-install-generate.ts`. Covers:
 *   - install vs uninstall messaging
 *   - global vs project scope flag suffix
 *   - exitCode !== 0 → warn about manual generate
 *   - runGenerate throws → warn twice (error + remediation)
 *   - returns the skipped settings from the generate data, [] when it threw
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  runGenerateMock: vi.fn(),
  renderGenerateMock: vi.fn(),
}));

vi.mock('../../../src/cli/commands/generate.js', () => ({
  runGenerate: mocks.runGenerateMock,
}));
vi.mock('../../../src/cli/renderers/generate.js', () => ({
  renderGenerate: mocks.renderGenerateMock,
}));

const { runPostOperationGenerate } =
  await import('../../../src/install/run/post-install-generate.js');
import { logger } from '../../../src/utils/output/logger.js';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.runGenerateMock.mockClear();
  mocks.renderGenerateMock.mockClear();
  warnSpy?.mockRestore();
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

describe('runPostOperationGenerate', () => {
  it('does not warn on success (exitCode 0) for project install', async () => {
    mocks.runGenerateMock.mockResolvedValue({ exitCode: 0, data: {} });
    await runPostOperationGenerate('install', 'project', '/p');
    expect(mocks.runGenerateMock).toHaveBeenCalledWith({}, '/p', { printMatrix: false });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns and includes "agentsmesh generate --global" hint for global uninstall failure', async () => {
    mocks.runGenerateMock.mockResolvedValue({ exitCode: 1, data: {} });
    await runPostOperationGenerate('uninstall', 'global', '/p');
    expect(mocks.runGenerateMock).toHaveBeenCalledWith({ global: true }, '/p', {
      printMatrix: false,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(
      /Generate failed after uninstall.*agentsmesh generate --global/,
    );
  });

  it('catches runGenerate throws and warns twice (project install)', async () => {
    mocks.runGenerateMock.mockRejectedValue(new Error('boom'));
    await runPostOperationGenerate('install', 'project', '/p');
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/Generate failed after install: boom/);
    expect(warnSpy.mock.calls[1]![0]).toMatch(
      /Pack is installed.*agentsmesh generate(?! --global)/,
    );
  });

  it('returns the skipped settings from the generate data', async () => {
    const skippedSettings = [{ feature: 'mcp', items: ['packsrv'] }];
    mocks.runGenerateMock.mockResolvedValue({ exitCode: 0, data: { skippedSettings } });
    expect(await runPostOperationGenerate('install', 'project', '/p')).toEqual(skippedSettings);
  });

  it('returns [] when the generate data has none or generate threw', async () => {
    mocks.runGenerateMock.mockResolvedValueOnce({ exitCode: 0, data: {} });
    mocks.runGenerateMock.mockRejectedValueOnce(new Error('boom'));
    const results = [
      await runPostOperationGenerate('install', 'project', '/p'),
      await runPostOperationGenerate('install', 'project', '/p'),
    ];
    expect(results).toEqual([[], []]);
  });

  it('catches runGenerate throws and warns with --global suffix when scope is global', async () => {
    mocks.runGenerateMock.mockRejectedValue('non-error');
    await runPostOperationGenerate('uninstall', 'global', '/p');
    expect(warnSpy.mock.calls[1]![0]).toContain('agentsmesh generate --global');
  });
});
