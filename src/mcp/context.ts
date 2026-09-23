import { findLessonsProjectRoot } from '../lessons/paths.js';
import { resolve, dirname } from 'node:path';
import { stat } from 'node:fs/promises';
import { McpError } from './errors.js';
import { loadCanonicalFiles } from '../canonical/load/loader.js';
import { loadConfigFromExactDir } from '../config/core/loader.js';
import { bootstrapPlugins } from '../plugins/bootstrap-plugins.js';
import type { CanonicalFiles } from '../core/types.js';

export interface McpContext {
  projectRoot: string;
  /**
   * Where the lessons tools read and write, when it is not `projectRoot`
   * (see {@link lessonsRootOf}). Null outside any project.
   */
  lessonsRoot?: string | null;
  loadCanonical: () => Promise<CanonicalFiles>;
}

/** The lessons root of `ctx`, or null when there is none. */
export function lessonsRootOf(ctx: McpContext): string | null {
  return ctx.lessonsRoot === undefined ? ctx.projectRoot : ctx.lessonsRoot;
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
  /**
   * Default true. False is the lessons tools' context: rooted like the MCP
   * instructions and the recall hook, never requiring `agentsmesh.yaml` — a
   * plugin-only repo has none.
   */
  requireProject?: boolean;
}): Promise<McpContext> {
  if (opts.requireProject === false) {
    const lessonsRoot = findLessonsProjectRoot(opts.cwd);
    const projectRoot = lessonsRoot ?? resolve(opts.cwd);
    return { projectRoot, lessonsRoot, loadCanonical: () => loadCanonicalFiles(projectRoot) };
  }
  const projectRoot = await findProjectRoot(opts.cwd);
  await loadProjectPlugins(projectRoot);
  return {
    projectRoot,
    loadCanonical: () => loadCanonicalFiles(projectRoot),
  };
}
