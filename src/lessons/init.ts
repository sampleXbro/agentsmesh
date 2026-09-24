import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { maybeAutoMigrateLessons } from './auto-migrate.js';
import { captureLogPath } from './capture-telemetry.js';
import { lessonsLockPath } from './lessons-lock.js';
import { outcomeLogPath } from './outcome-log.js';
import { mutateLessonsGraphLocked } from './mutate.js';
import { lessonsPaths, toRelPath } from './paths.js';
import { defaultLessonsConfig } from './recall-config.js';
import { injectRecallHook } from './recall-hook-scaffold.js';
import {
  ensureLessonsMergeDriver,
  LESSONS_GITATTRIBUTES_ENTRY,
  type MergeDriverSetup,
} from './merge-driver-setup.js';
import { recallHookTeamHint as teamHintFor } from './recall-hook-hint.js';
import { recallLogPath } from './telemetry.js';
import { ensureGitattributesEntries } from '../utils/filesystem/gitattributes.js';
import { ensureGitignoreEntries } from '../utils/filesystem/gitignore.js';
import {
  appendLessonsParagraph,
  LESSONS_PARAGRAPH_BLOCK,
} from '../targets/projection/lessons-paragraph.js';
import { LESSONS_SKILL_FILE, LESSONS_SKILL_NAME } from './skill.js';

export interface ScaffoldLessonsResult {
  readonly created: string[];
  /** Managed artifacts rewritten to the current wording (e.g. a stale skill). */
  readonly updated: string[];
  readonly skipped: string[];
  readonly rootRuleUpdated: boolean;
  /** True when any lessons runtime-artifact entry was added to `.gitignore`. */
  readonly gitignoreUpdated: boolean;
  /** True when the lessons.json merge-driver entry was added to `.gitattributes`. */
  readonly gitattributesUpdated: boolean;
  /** True when the lessons recall hook was injected into `hooks.yaml`. */
  readonly recallHookInjected: boolean;
  /** What this clone's merge-driver setup did; teammates get it on `generate`. */
  readonly mergeDriver: MergeDriverSetup;
  /** Set when recall hooks still need a global install to reach teammates. */
  readonly recallHookTeamHint: string | null;
}

/**
 * Idempotent scaffolder for the lessons subsystem. Backs `agentsmesh init
 * --lessons`, the lessons-only retrofit, and the import safety net.
 *
 * - Creates `.agentsmesh/lessons/lessons.json` (an empty graph) if missing.
 * - Injects the lessons ritual (Tier 1 — the always-on trigger) into
 *   `.agentsmesh/rules/_root.md` as a managed block
 *   (`<!-- agentsmesh:lessons-contract:start -->` … `:end -->`). The block is
 *   canonical content so it reaches every target — including rules-directory
 *   targets the generation-contract decorator skips — while the sentinels keep
 *   the block an identifiable unit for clean round-trip and let re-running
 *   scaffold refresh the wording from one constant.
 * - Writes `.agentsmesh/skills/lessons/SKILL.md` (Tier 2 — the on-demand manual).
 *   Like the Tier-1 paragraph, this is a MANAGED artifact: every run rewrites it
 *   to the current manual so an upgraded agentsmesh propagates the new wording
 *   (reported as `updated` when it changed, `skipped` when already current).
 *   The graph, by contrast, is user data and stays create-if-missing. Targets
 *   without skills still get Tier 1.
 */
export async function scaffoldLessons(projectRoot: string): Promise<ScaffoldLessonsResult> {
  const paths = lessonsPaths(projectRoot);
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  mkdirSync(paths.base, { recursive: true });
  // Migrate a legacy store before scaffolding so a retrofit does not create an
  // empty graph over still-unmigrated lessons (which would strand them forever).
  await maybeAutoMigrateLessons(projectRoot);
  if (existsSync(paths.graph)) {
    skipped.push(paths.graph);
  } else {
    // Create the empty graph through the transactional path so even the initial
    // write holds the lock and re-reads under it — it cannot clobber a graph a
    // concurrent writer just created.
    await mutateLessonsGraphLocked(projectRoot, () => {});
    created.push(paths.graph);
  }

  seedLessonsConfig(projectRoot, created, skipped);
  seedLessonsSkill(projectRoot, created, updated, skipped);

  const rootRuleUpdated = injectProceduralBlock(projectRoot);
  // Auto-wire deterministic hook-mode recall for hook-capable targets; non-hook
  // targets keep the always-on paragraph injected above as their fallback.
  const recallHookInjected = injectRecallHook(projectRoot);
  // Keep every lessons runtime artifact out of git: the three logs, the lock
  // directory, and the `*.tmp` files an atomic write leaves behind when killed.
  // Paths come from their owning modules; the append is idempotent and
  // coverage-aware, so a re-run or a broader `.agentsmesh/` ignore is a no-op.
  const gitignoreUpdated = await ensureGitignoreEntries(projectRoot, [
    toRelPath(projectRoot, recallLogPath(projectRoot)),
    toRelPath(projectRoot, captureLogPath(projectRoot)),
    toRelPath(projectRoot, outcomeLogPath(projectRoot)),
    `${toRelPath(projectRoot, lessonsLockPath(projectRoot))}/`,
    `${toRelPath(projectRoot, paths.base)}/*.tmp`,
  ]);
  // Commit the merge-driver binding for the shared graph so a team's concurrent
  // captures union-merge instead of leaving conflict markers. Idempotent and
  // preserves any existing .gitattributes content.
  const gitattributesUpdated = await ensureGitattributesEntries(projectRoot, [
    LESSONS_GITATTRIBUTES_ENTRY,
  ]);
  // The per-clone half: set this clone's driver now instead of printing it.
  const mergeDriver = ensureLessonsMergeDriver(projectRoot);
  return {
    created,
    updated,
    skipped,
    rootRuleUpdated,
    gitignoreUpdated,
    gitattributesUpdated,
    recallHookInjected,
    mergeDriver,
    recallHookTeamHint: teamHintFor(projectRoot),
  };
}

/**
 * Write the Tier-2 lessons manual at `.agentsmesh/skills/lessons/SKILL.md`.
 * Managed (not user-owned), mirroring the Tier-1 paragraph: every run rewrites
 * it to {@link LESSONS_SKILL_FILE}, so a re-run after an agentsmesh upgrade
 * refreshes a stale manual. Records the path in `created` (new), `updated`
 * (rewritten because it drifted), or `skipped` (already current).
 */
function seedLessonsSkill(
  projectRoot: string,
  created: string[],
  updated: string[],
  skipped: string[],
): void {
  const skillPath = join(projectRoot, '.agentsmesh/skills', LESSONS_SKILL_NAME, 'SKILL.md');
  const desired = `${LESSONS_SKILL_FILE}\n`;
  if (!existsSync(skillPath)) {
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, desired, 'utf8');
    created.push(skillPath);
    return;
  }
  if (readFileSync(skillPath, 'utf8') === desired) {
    skipped.push(skillPath);
    return;
  }
  writeFileSync(skillPath, desired, 'utf8');
  updated.push(skillPath);
}

/**
 * Write `.agentsmesh/lessons/config.json` with every tunable at its default, so
 * the recall caps and `autoPrune` are discoverable and editable without reading
 * the docs. User data, NOT a managed artifact: create-if-missing only — an
 * existing config (with the user's edits) is left untouched and reported skipped.
 */
function seedLessonsConfig(projectRoot: string, created: string[], skipped: string[]): void {
  const configPath = lessonsPaths(projectRoot).config;
  if (existsSync(configPath)) {
    skipped.push(configPath);
    return;
  }
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(defaultLessonsConfig(), null, 2)}\n`, 'utf8');
  created.push(configPath);
}

function injectProceduralBlock(projectRoot: string): boolean {
  const rootRule = join(projectRoot, '.agentsmesh/rules/_root.md');
  if (!existsSync(rootRule)) {
    mkdirSync(dirname(rootRule), { recursive: true });
    const seeded = `---\nroot: true\ndescription: ""\n---\n\n${LESSONS_PARAGRAPH_BLOCK}\n\n# Operational Guidelines\n`;
    writeFileSync(rootRule, seeded, 'utf8');
    return true;
  }
  const current = readFileSync(rootRule, 'utf8');
  const desired = `${appendLessonsParagraph(current)}\n`;
  if (desired === current) return false;
  writeFileSync(rootRule, desired, 'utf8');
  return true;
}
