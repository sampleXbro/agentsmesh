import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Default on-disk locations for the lessons subsystem.
 *
 * Canonical store: `<projectRoot>/.agentsmesh/lessons/lessons.json` (the JSON
 * graph). The legacy paths (`journal`, `index`, `topicsDir`) are retained for
 * the one-shot upgrade migrator only; fresh projects never create them.
 */
export interface LessonsPaths {
  /** Directory containing every lessons artifact. */
  readonly base: string;
  /** Canonical JSON graph — the single source of truth. */
  readonly graph: string;
  /** Optional per-project recall tuning (recallLimit / recallMaxTokens). */
  readonly config: string;
  /** Legacy append-only journal. Used by the migrator only. */
  readonly journal: string;
  /** Legacy YAML trigger index. Used by the migrator only. */
  readonly index: string;
  /** Legacy per-topic Markdown directory. Used by the migrator only. */
  readonly topicsDir: string;
}

const BASE_REL = '.agentsmesh/lessons';

export function lessonsPaths(projectRoot: string): LessonsPaths {
  const base = join(projectRoot, BASE_REL);
  return {
    base,
    graph: join(base, 'lessons.json'),
    config: join(base, 'config.json'),
    journal: join(base, 'journal.md'),
    index: join(base, 'index.yaml'),
    topicsDir: join(base, 'topics'),
  };
}

/**
 * Whether the lessons subsystem was fully set up via `agentsmesh init --lessons`
 * (or the import safety net) — as opposed to a graph-only state a bare
 * `lessons add` bootstraps. `config.json` is the tell: `scaffoldLessons` seeds it,
 * but the transactional capture path never does, so its presence means the
 * recall ritual + hook + skill were all wired too. When this is false, lessons
 * may exist on disk but no agent is told to recall them.
 */
export function lessonsActivated(projectRoot: string): boolean {
  return existsSync(lessonsPaths(projectRoot).config);
}

/** The one-line "you haven't enabled lessons" pointer the read/capture paths show. */
export function lessonsSetupHint(): string {
  return 'lessons is not fully set up here — run `agentsmesh init --lessons`, then `agentsmesh generate`, to wire recall + capture into your AI tools.';
}

/**
 * The directory whose lessons apply to `start`: `start` itself when it holds a
 * graph or a lessons config, else the nearest ancestor that does, else `start`.
 *
 * The recall hook, the MCP server and the lessons CLI all resolve from here,
 * so running in a package of a monorepo (or any subfolder) finds the project.
 */
export function resolveLessonsRoot(start: string): string {
  const origin = resolve(start);
  return findLessonsRoot(origin) ?? origin;
}

/**
 * The nearest of `start` and its ancestors holding a graph or a lessons config,
 * or null. Keys off `.agentsmesh/lessons/` artifacts, never a bare
 * `.agentsmesh`: the global config lives in `~/.agentsmesh` and holds no graph.
 */
export function findLessonsRoot(start: string): string | null {
  return findUp(resolve(start), hasLessonsAt);
}

/**
 * Where the MCP lessons tools read and write: the nearest lessons root, else
 * the nearest agentsmesh project (`agentsmesh.yaml`), else the git work tree,
 * else null — outside any project there is nowhere a captured lesson belongs.
 */
export function findLessonsProjectRoot(start: string): string | null {
  const origin = resolve(start);
  return (
    findLessonsRoot(origin) ??
    findUp(origin, (dir) => existsSync(join(dir, 'agentsmesh.yaml'))) ??
    // Plugin-only use has no agentsmesh.yaml: the repository is the project.
    findUp(origin, (dir) => existsSync(join(dir, '.git')))
  );
}

function hasLessonsAt(dir: string): boolean {
  const paths = lessonsPaths(dir);
  return existsSync(paths.graph) || existsSync(paths.config);
}

/**
 * The first of `start` and its ancestors where `hit` holds, or null. The walk
 * stops below the home directory: lessons belong to a repository, and a graph
 * under `~` would otherwise apply to every folder beneath it.
 */
function findUp(start: string, hit: (dir: string) => boolean): string | null {
  const stops = homeDirs();
  let dir = start;
  let prev = '';
  while (dir !== prev && !stops.has(dir)) {
    if (hit(dir)) return dir;
    prev = dir;
    dir = dirname(dir);
  }
  return null;
}

/** True for the home folder, whose `.agentsmesh` is the global config, never a lessons project. */
export function isHomeDirectory(dir: string): boolean {
  return homeDirs().has(resolve(dir));
}

/** The home directory as given and as resolved: HOME may be a symlink (macOS `/tmp`). */
function homeDirs(): ReadonlySet<string> {
  const home = homedir();
  if (home === '') return new Set();
  const dirs = new Set([resolve(home)]);
  try {
    dirs.add(realpathSync(home));
  } catch {
    // A home that does not exist has no other name.
  }
  return dirs;
}

/**
 * Project-relative path for a given absolute path, normalized to forward
 * slashes for cross-platform consistency in markdown rule files.
 */
export function toRelPath(projectRoot: string, absolute: string): string {
  return relative(projectRoot, absolute).split(sep).join('/');
}

/**
 * Tier 1 of the lessons contract: the always-on trigger.
 *
 * Lives in the project's root rule (`.agentsmesh/rules/_root.md`) as a managed
 * block, so it reaches every target through canonical rule generation. Universal:
 * only requires the ability to shell-exec the `agentsmesh` CLI. No `Skill` tool,
 * no description-match, no per-target projection.
 *
 * Deliberately minimal — it carries only the BINDING essentials (both commands,
 * the BLOCKING framing, the recall scope, the broad capture scope, the graph
 * path, the MCP fallback). The expansive how-to (full command set, topic
 * workflow, trigger-flag mechanics, the complete rejected-excuse enumeration, and
 * the rebuttal pedagogy) lives in the `lessons` skill (`LESSONS_SKILL_BODY`) so
 * the manual can grow without bloating every target's always-on context.
 *
 * Recall is scoped to MUTATING actions — file edits and state-changing commands —
 * with pure-read commands and the recall query itself explicitly exempt. This
 * removes the infinite regress (recall before the recall command) and the
 * most-flouted "read-only included" clause, cutting guarded actions roughly in
 * half (exploration is read-heavy) while keeping recall where it changes outcomes.
 *
 * Structural shape (heading + intro + Recall block + Capture block + closing)
 * survives generate → import → generate round-trip; only the wording inside each
 * block is tightened for maximum agent compliance.
 */
export const LESSONS_PROCEDURAL_RULE = `## Lessons (BLOCKING)

Graph \`.agentsmesh/lessons/lessons.json\` is canonical; never hand-edit it. Manual: \`lessons\` skill.

**Recall:** before every file edit or state-changing command, MUST run \`agentsmesh lessons query --file <path> --cmd <command> --session auto\` and obey matches; at task start, ALSO run \`agentsmesh lessons query --keyword "<task terms>" --always --session auto\` for conceptual + universal rules no path/command names. Pure-read commands and recall itself are exempt.

**Capture:** after any failure, user correction, regression, wrong assumption, useful surprise, repeated friction, or non-obvious fix, MUST self-critique and run \`agentsmesh lessons add "<imperative rule>" --topic <id> --trigger-file <glob> --evidence <sha|lesson-id>\`.

**Before final:** report \`Lesson: captured <id>\` or \`Lesson: none\`. No recall/capture gate = task incomplete. No shell: use \`lessons_query\` / \`lessons_add\`.`;
