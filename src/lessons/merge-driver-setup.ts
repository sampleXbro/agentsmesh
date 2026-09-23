/**
 * Setup for the lessons.json git merge driver (see
 * lessons-merge-driver-handler.ts).
 *
 * A merge driver has two halves: a COMMITTABLE `.gitattributes` line that binds
 * lessons.json to the driver — one dev commits it, the whole team inherits it —
 * and a PER-CLONE `git config` pair. Git never runs config from a clone (that
 * would be a remote-code-execution vector), so without the second half every
 * other clone falls back to a line merge and conflicts. `init --lessons` writes
 * the first half; {@link ensureLessonsMergeDriver} writes the second when a user
 * runs agentsmesh in their own clone.
 */
import { agentsmeshInvocation } from './cli-invocation.js';
import { runGit, type GitRunner } from './git-exec.js';
import { commandLauncherExists, commandProgram } from './launcher.js';
import { LESSONS_GRAPH_PATH } from './graph-store.js';

export const LESSONS_MERGE_DRIVER = 'agentsmesh-lessons';

/** Committable `.gitattributes` entry binding the graph to the union merge driver. */
export const LESSONS_GITATTRIBUTES_ENTRY = `${LESSONS_GRAPH_PATH} merge=${LESSONS_MERGE_DRIVER}`;

const DRIVER_KEY = `merge.${LESSONS_MERGE_DRIVER}.driver`;
const NAME_KEY = `merge.${LESSONS_MERGE_DRIVER}.name`;
const DRIVER_NAME = 'agentsmesh lessons union';

/** The driver command git runs. Forward slashes only: git runs it through `sh`. */
export function lessonsMergeDriverCommand(invocation: string): string {
  return `${invocation.replaceAll('\\', '/')} lessons merge-driver %O %A %B`;
}

/** Values agentsmesh itself configured or suggested; safe to replace. */
const OWN_COMMANDS = new Set(
  ['agentsmesh', 'npx --no --offline agentsmesh'].map(lessonsMergeDriverCommand),
);

export type MergeDriverSetup =
  | {
      readonly status: 'configured' | 'updated' | 'unchanged' | 'skipped';
      readonly command: string;
    }
  | { readonly status: 'custom'; readonly command: string; readonly existing: string }
  | { readonly status: 'failed'; readonly command: string; readonly reason: string };

export interface MergeDriverSetupOptions {
  /** How the driver launches the CLI; defaults to {@link agentsmeshInvocation}. */
  readonly invocation?: string;
  readonly git?: GitRunner;
}

function configValue(git: GitRunner, root: string, key: string): string | null {
  const r = git(root, ['config', '--get', key]);
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * In a git work tree whose attributes bind lessons.json to the driver, set the
 * per-clone driver config when it is missing (or is an older agentsmesh value).
 * Never throws; a user's own driver value is kept and reported.
 */
export function ensureLessonsMergeDriver(
  projectRoot: string,
  options: MergeDriverSetupOptions = {},
): MergeDriverSetup {
  const git = options.git ?? runGit;
  const command = lessonsMergeDriverCommand(
    options.invocation ?? agentsmeshInvocation(projectRoot),
  );
  // Exits non-zero outside a work tree, so this is also the "is this git?" check.
  const attr = git(projectRoot, ['check-attr', 'merge', '--', LESSONS_GRAPH_PATH]);
  if (attr.status !== 0 || !attr.stdout.trim().endsWith(`: merge: ${LESSONS_MERGE_DRIVER}`)) {
    return { status: 'skipped', command };
  }
  const existing = configValue(git, projectRoot, DRIVER_KEY);
  if (existing !== null && existing !== command && !OWN_COMMANDS.has(existing)) {
    return { status: 'custom', command, existing };
  }
  // A driver git cannot start leaves our side as-is with no markers: worse than none.
  if (existing !== command && !commandLauncherExists(command)) {
    const reason =
      `\`${commandProgram(command)}\` is not on PATH, so git could not start the driver; ` +
      'install agentsmesh globally or as a project devDependency';
    return { status: 'failed', command, reason };
  }
  const writes: Array<[string, string]> = [];
  if (existing !== command) writes.push([DRIVER_KEY, command]);
  if (configValue(git, projectRoot, NAME_KEY) === null) writes.push([NAME_KEY, DRIVER_NAME]);
  for (const [key, value] of writes) {
    const r = git(projectRoot, ['config', '--local', key, value]);
    if (r.status !== 0) {
      const detail = r.stderr.trim() || `exit ${r.status}`;
      const reason = `git config failed (${detail}); run: git config ${DRIVER_KEY} "${command}"`;
      return { status: 'failed', command, reason };
    }
  }
  if (existing === command) return { status: 'unchanged', command };
  return { status: existing === null ? 'configured' : 'updated', command };
}

/** One line for a renderer, or null when there is nothing worth saying. */
export function mergeDriverSetupLine(setup: MergeDriverSetup): string | null {
  const set = `git config ${DRIVER_KEY} "${setup.command}"`;
  switch (setup.status) {
    case 'configured':
      return `Enabled the lessons.json merge driver for this clone (${set}).`;
    case 'updated':
      return `Updated the lessons.json merge driver for this clone (${set}).`;
    case 'custom':
      return `Kept your own lessons.json merge driver (${DRIVER_KEY} = "${setup.existing}"); the agentsmesh one is "${setup.command}".`;
    case 'failed':
      return `Could not enable the lessons.json merge driver: ${setup.reason}.`;
    default:
      return null;
  }
}
