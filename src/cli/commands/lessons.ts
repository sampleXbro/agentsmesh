/**
 * agentsmesh lessons — query / add / topics / show / deprecate / merge / untrigger / strip-markers / journal / validate / resolve / stats / prune / import-md.
 * Auto-migrates from legacy index.yaml + topics on first invocation.
 */
import { maybeAutoMigrateLessons } from '../../lessons/auto-migrate.js';
import { problemFromLoad } from '../../lessons/graph-problem.js';
import { loadLessonsGraphResilient } from '../../lessons/graph-store.js';
import { isHomeDirectory, resolveLessonsRoot } from '../../lessons/paths.js';
import {
  doAdd,
  doDeprecate,
  doHook,
  doImportMd,
  doJournal,
  doMerge,
  doMergeDriver,
  doPrune,
  doQuery,
  doShow,
  doStats,
  doStripMarkers,
  doTopics,
  doUntrigger,
  type LessonsFlags,
} from './lessons-handlers.js';
import { validateLessonsFlags, validateLessonsPositionals } from './lessons-known-flags.js';
import { LESSONS_USAGE } from './lessons-usage.js';
import { doResolve } from './lessons-resolve-handler.js';
import type { LessonsCommandResult } from './lessons-types.js';
import { doValidate } from './lessons-validate-handler.js';

export type { LessonsCommandResult } from './lessons-types.js';

/**
 * Pre-dispatch legacy migration. `import-md` migrates explicitly (never here).
 * The RECALL subcommands (`query`, `hook`) must never crash — a corrupt legacy
 * store degrades to an unmigrated (usually absent) graph, leaving the legacy
 * files intact for an explicit `import-md` to surface the error loudly. Every
 * other subcommand keeps the throw: failing a write loudly prevents a fresh
 * empty graph from permanently stranding an unmigrated legacy store.
 */
async function migrateForSubcommand(
  subcommand: string,
  projectRoot: string,
): Promise<{ migrated: boolean; error?: string }> {
  // `resolve` and the git merge driver work on a conflicted graph mid-merge;
  // migrating first could write over it or fail the merge.
  if (subcommand === 'import-md' || subcommand === 'resolve' || subcommand === 'merge-driver') {
    return { migrated: false };
  }
  if (subcommand === 'query' || subcommand === 'hook') {
    try {
      return { migrated: await maybeAutoMigrateLessons(projectRoot) };
    } catch (err) {
      // `query` reports it; the hook stays silent.
      return { migrated: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { migrated: await maybeAutoMigrateLessons(projectRoot) };
}

/** Internal subcommands locate their own files: the hook payload cwd, git's merge paths. */
const OWN_LOCATION = new Set(['hook', 'merge-driver']);

/** Subcommands that can create a graph from nothing. */
const CREATES_GRAPH: ReadonlySet<string> = new Set(['add', 'import-md']);
const HOME_REFUSAL =
  'This is your home folder: its .agentsmesh holds the global agentsmesh config, not a lessons ' +
  'project. Run this inside your project (set it up once with `agentsmesh init --lessons`).';

/** Subcommands that report an unreadable graph themselves (or work on a conflicted one). */
const OWN_GRAPH_PROBLEM = new Set(['query', 'validate', 'resolve', 'hook', 'merge-driver']);

export async function runLessons(
  flags: LessonsFlags,
  args: string[],
  cwd: string,
): Promise<LessonsCommandResult> {
  const subcommand = args[0];
  if (subcommand === undefined || subcommand === '') {
    return { subcommand: 'help', exitCode: 0, data: null };
  }
  if (subcommand === 'help') return helpFor(args[1]);

  // Reject typoed/unknown or repeated flags and extra positionals before any
  // side effect: the parser is permissive, so a silently-ignored `--trigger-flie`
  // or unquoted rule word would change what gets captured.
  const argError =
    validateLessonsFlags(subcommand, flags) ??
    validateLessonsPositionals(subcommand, args.slice(1));
  if (argError !== null) {
    return { subcommand: 'help', exitCode: 2, error: argError, data: null };
  }

  // Like git, a subdirectory acts on the enclosing lessons project (as the hook
  // and MCP server do); with none up the tree, the cwd itself is the project.
  const projectRoot = OWN_LOCATION.has(subcommand) ? cwd : resolveLessonsRoot(cwd);
  if (CREATES_GRAPH.has(subcommand) && isHomeDirectory(projectRoot)) {
    return { subcommand: 'help', exitCode: 2, error: HOME_REFUSAL, data: null };
  }
  if (OWN_GRAPH_PROBLEM.has(subcommand)) return dispatch(subcommand, flags, args, projectRoot);
  // A failure caused by an unreadable graph gets the shared diagnosis (merge
  // conflict, corruption, newer schema) instead of raw parser or schema text.
  try {
    const result = await dispatch(subcommand, flags, args, projectRoot);
    const problem =
      result.exitCode === 1 && result.error !== undefined ? graphProblem(projectRoot) : null;
    return problem === null ? result : { ...result, error: problem };
  } catch (err) {
    const problem = graphProblem(projectRoot);
    if (problem === null) throw err;
    return { subcommand: 'help', exitCode: 1, error: problem, data: null };
  }
}

/** `lessons help [subcommand]`: the overview, or one subcommand's help. */
function helpFor(topic: string | undefined): LessonsCommandResult {
  if (topic === undefined) return { subcommand: 'help', exitCode: 0, data: null };
  if (LESSONS_USAGE[topic] === undefined) {
    const error = `Unknown lessons subcommand: ${topic}`;
    return { subcommand: 'help', exitCode: 2, error, data: null };
  }
  return { subcommand: 'help', exitCode: 0, data: null, topic };
}

/** Why the graph fails to load, else null. No git check: a mid-merge graph that loads is not the cause. */
function graphProblem(projectRoot: string): string | null {
  return problemFromLoad(projectRoot, loadLessonsGraphResilient(projectRoot))?.message ?? null;
}

async function dispatch(
  subcommand: string,
  flags: LessonsFlags,
  args: string[],
  projectRoot: string,
): Promise<LessonsCommandResult> {
  const migration = await migrateForSubcommand(subcommand, projectRoot);

  switch (subcommand) {
    case 'query':
      return doQuery(flags, projectRoot, migration.migrated, migration.error);
    case 'add':
      return doAdd(flags, args[1], projectRoot);
    case 'topics':
      return doTopics(projectRoot);
    case 'show':
      return doShow(args[1], projectRoot);
    case 'deprecate':
      return doDeprecate(flags, args[1], projectRoot);
    case 'merge':
      return doMerge(args[1], args[2], projectRoot);
    case 'untrigger':
      return doUntrigger(args[1], args[2], projectRoot);
    case 'strip-markers':
      return doStripMarkers(flags, projectRoot);
    case 'journal':
      return doJournal(projectRoot);
    case 'validate':
      return doValidate(projectRoot);
    case 'resolve':
      return doResolve(projectRoot);
    case 'stats':
      return doStats(flags, projectRoot);
    case 'prune':
      return doPrune(flags, projectRoot);
    case 'import-md':
      return doImportMd(flags, projectRoot);
    case 'hook':
      // Internal: invoked by a generated PostToolUse hook, not by a human, so it
      // is intentionally absent from LESSONS_SUBCOMMANDS / help.
      return doHook(projectRoot);
    case 'merge-driver':
      // Internal: invoked by git as a merge driver (args = base ours theirs),
      // not by a human — intentionally absent from LESSONS_SUBCOMMANDS / help.
      return doMergeDriver(args.slice(1));
    default:
      return {
        subcommand: 'help',
        exitCode: 2,
        error: `Unknown lessons subcommand: ${subcommand}`,
        data: null,
      };
  }
}
