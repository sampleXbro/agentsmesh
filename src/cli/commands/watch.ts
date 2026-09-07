/**
 * agentsmesh watch — watch canonical files and regenerate on change.
 */

import { join } from 'node:path';
import { shouldIgnoreWatchPath } from './watch-path.js';
import chokidar from 'chokidar';
import { loadScopedConfig } from '../../config/core/scope.js';
import { loadCanonicalWithExtends } from '../../canonical/extends/extends.js';
import { runGenerate } from './generate.js';
import { renderGenerate } from '../renderers/generate.js';
import { runMatrix } from './matrix.js';
import { renderMatrix } from '../renderers/matrix.js';
import { logger } from '../../utils/output/logger.js';

const DEBOUNCE_MS = 300;

export interface WatchCycleInfo {
  /** True when the current cycle observed a feature/fingerprint change vs. the previous cycle. */
  featuresChanged: boolean;
}

export interface RunWatchOptions {
  /** Called after each generation cycle, including startup. */
  onCycle?: (info: WatchCycleInfo) => void;
  /** Defaults to polling on Windows; tests force polling to avoid dropped events. */
  usePolling?: boolean;
  /** Poll interval in milliseconds; chokidar defaults to 100ms. */
  pollIntervalMs?: number;
}

function featureFingerprint(
  features: string[],
  rulesCount: number,
  commandsCount: number,
  agentsCount: number,
  skillsCount: number,
  mcpServerCount: number,
  permissionsCount: number,
  hooksCount: number,
  ignoreCount: number,
): string {
  return JSON.stringify({
    features,
    rulesCount,
    commandsCount,
    agentsCount,
    skillsCount,
    mcpServerCount,
    permissionsCount,
    hooksCount,
    ignoreCount,
  });
}

/**
 * Run the watch command.
 * Watches .agentsmesh/ and agentsmesh.yaml. On change: debounce 300ms, re-run
 * generate, print compact summary, show matrix if features changed.
 * @param flags - CLI flags (targets, verbose)
 * @param projectRoot - Project root (default process.cwd())
 * @param watchOptions - Optional callbacks (onCycle for deterministic test sync)
 * @returns Object with stop() to stop watching
 * @throws When not initialized (no agentsmesh.yaml)
 */
export async function runWatch(
  flags: Record<string, string | boolean>,
  projectRoot?: string,
  watchOptions: RunWatchOptions = {},
): Promise<{ stop: () => Promise<void> }> {
  const root = projectRoot ?? process.cwd();
  const scope = flags.global === true ? 'global' : 'project';
  const { context } = await loadScopedConfig(root, scope);

  const paths = [
    context.canonicalDir,
    join(context.configDir, 'agentsmesh.yaml'),
    join(context.configDir, 'agentsmesh.local.yaml'),
  ];

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFingerprint: string | null = null;
  let stopped = false;
  let pendingRun: Promise<void> | null = null;

  const run = async (): Promise<void> => {
    if (stopped) return;
    debounceTimer = null;
    const { config, context: activeContext } = await loadScopedConfig(root, scope);
    const { canonical } = await loadCanonicalWithExtends(
      config,
      activeContext.configDir,
      {},
      activeContext.canonicalDir,
    );

    const mcpServerCount = canonical.mcp ? Object.keys(canonical.mcp.mcpServers).length : 0;
    const permissionsCount = canonical.permissions
      ? canonical.permissions.allow.length + canonical.permissions.deny.length
      : 0;
    const hooksCount = canonical.hooks
      ? Object.values(canonical.hooks).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0,
        )
      : 0;
    const ignoreCount = canonical.ignore.length;
    const fp = featureFingerprint(
      config.features,
      canonical.rules.length,
      canonical.commands.length,
      canonical.agents.length,
      canonical.skills.length,
      mcpServerCount,
      permissionsCount,
      hooksCount,
      ignoreCount,
    );
    const featuresChanged = lastFingerprint !== null && lastFingerprint !== fp;
    lastFingerprint = fp;

    if (stopped) return;
    const genResult = await runGenerate(flags, root, { printMatrix: false });
    renderGenerate(genResult);

    if (stopped) return;
    if (featuresChanged) {
      const matrixResult = await runMatrix(flags, root);
      renderMatrix(matrixResult, { verbose: flags.verbose === true });
    } else {
      logger.info('Regenerated.');
    }

    watchOptions.onCycle?.({ featuresChanged });
  };

  const scheduleRun = (): void => {
    const runPromise = run()
      .catch((err: unknown) => {
        if (!stopped) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(message);
        }
      })
      .finally(() => {
        if (pendingRun === runPromise) pendingRun = null;
      });
    pendingRun = runPromise;
  };

  const schedule = (): void => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scheduleRun, DEBOUNCE_MS);
  };

  // Native fs.watch on Windows (ReadDirectoryChangesW) misses events for files
  // created in just-watched subdirectories, especially under the AppData\Local\Temp
  // short-name path used by GitHub Actions runners. Force polling there so the
  // watcher reliably observes new canonical files. macOS/Linux keep the native
  // watcher for low-latency event delivery. Tests override via `usePolling`.
  const usePolling = watchOptions.usePolling ?? process.platform === 'win32';
  const watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    usePolling,
    ...(usePolling && watchOptions.pollIntervalMs !== undefined
      ? { interval: watchOptions.pollIntervalMs }
      : {}),
  });
  watcher.on('all', (_eventName, changedPath) => {
    if (shouldIgnoreWatchPath(context.canonicalDir, changedPath)) return;
    schedule();
  });

  await new Promise<void>((resolve, reject) => {
    watcher.once('ready', resolve);
    watcher.once('error', reject);
  });

  logger.info(
    scope === 'global'
      ? 'Watching ~/.agentsmesh/ and agentsmesh.yaml...'
      : 'Watching .agentsmesh/ and agentsmesh.yaml...',
  );
  pendingRun = run();
  await pendingRun;
  pendingRun = null;

  return {
    stop: async (): Promise<void> => {
      stopped = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await watcher.close();
      if (pendingRun) await pendingRun;
    },
  };
}
