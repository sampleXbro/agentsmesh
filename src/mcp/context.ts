import { resolve, dirname } from 'node:path';
import { stat } from 'node:fs/promises';
import { McpError } from './errors.js';
import { loadCanonicalFiles } from '../canonical/load/loader.js';
import { loadConfigFromExactDir } from '../config/core/loader.js';
import { bootstrapPlugins } from '../plugins/bootstrap-plugins.js';
import type { CanonicalFiles } from '../core/types.js';

export interface McpContext {
  projectRoot: string;
  loadCanonical: () => Promise<CanonicalFiles>;
}

async function findProjectRoot(start: string): Promise<string> {
  let dir = resolve(start);
  while (true) {
    try {
      await stat(resolve(dir, 'agentsmesh.yaml'));
      return dir;
    } catch {
      /* not here */
    }
    const parent = dirname(dir);
    if (parent === dir) throw new McpError('NO_PROJECT', 'agentsmesh.yaml not found');
    dir = parent;
  }
}

const pluginRoots = new Set<string>();

/**
 * Register the project's plugin targets once per root, as the CLI does at
 * startup, so MCP tools see them. Plugins are optional: a config or plugin
 * failure is reported on stderr and never blocks the server.
 */
async function loadProjectPlugins(projectRoot: string): Promise<void> {
  if (pluginRoots.has(projectRoot)) return;
  pluginRoots.add(projectRoot);
  try {
    const { config } = await loadConfigFromExactDir(projectRoot);
    await bootstrapPlugins(config, projectRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`agentsmesh mcp: plugins not loaded: ${message}\n`);
  }
}

export async function resolveContext(opts: {
  cwd: string;
  /** Default true. False resolves to `cwd` when no `agentsmesh.yaml` is found. */
  requireProject?: boolean;
}): Promise<McpContext> {
  const projectRoot =
    opts.requireProject === false
      ? await findProjectRoot(opts.cwd).catch(() => resolve(opts.cwd))
      : await findProjectRoot(opts.cwd);
  await loadProjectPlugins(projectRoot);
  return {
    projectRoot,
    loadCanonical: () => loadCanonicalFiles(projectRoot),
  };
}
