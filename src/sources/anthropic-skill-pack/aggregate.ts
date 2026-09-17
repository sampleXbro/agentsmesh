/**
 * Pure orchestrator for the Anthropic skill-pack source descriptor.
 *
 * Walks a fetched `contentRoot`, calling the install-layer entity importers
 * for skills/agents/rules/commands, merges command files from per-tool
 * directories per the descriptor's precedence rules (see `merge-commands.ts`),
 * and surfaces broken relative markdown links per entity
 * (see `link-scan.ts`).
 *
 * Scope:
 *  - Pure: no prompting, no disk writes, no manifest reads.
 *  - The install pipeline (P8) consumes `AggregateResult`, drives the
 *    broken-link prompt with `brokenLinks`, applies any include-resolvable
 *    decisions, and writes the resulting pack.
 */

import { importSkills } from '../../install/importers/entity-importers.js';
import { readEntityDirWithMappers } from '../../install/importers/target-native-commands.js';
import type { ParseFrontmatterOptions } from '../../canonical/features/rules.js';
import type { EntityWithBrokenLinks } from '../../install/prompts/broken-link-prompt.js';
import type {
  CanonicalAgent,
  CanonicalCommand,
  CanonicalRule,
  CanonicalSkill,
} from '../../core/types.js';
import { buildIncludedPaths, detectBrokenLinks } from './link-scan.js';
import { MERGE_FROM_TOOL_DIRS, mergeCommands } from './merge-commands.js';

export interface CommandMergeSpec {
  /** Directory relative to `contentRoot` containing `*.md` command files. */
  readonly dir: string;
  /** Target id this directory is associated with; informational only. */
  readonly target?: string;
  /** Lower precedence wins on a `name` collision; ties resolve by array order. */
  readonly precedence: number;
}

export interface CommandDedup {
  /** Command name (basename without extension) where the conflict occurred. */
  readonly basename: string;
  /** Source path of the command that won the merge. */
  readonly winnerPath: string;
  /** Source paths of commands that lost, ordered by precedence ascending. */
  readonly loserPaths: readonly string[];
}

export interface AggregateResult {
  readonly skills: readonly CanonicalSkill[];
  readonly agents: readonly CanonicalAgent[];
  readonly commands: readonly CanonicalCommand[];
  readonly rules: readonly CanonicalRule[];
  readonly dedups: readonly CommandDedup[];
  readonly brokenLinks: readonly EntityWithBrokenLinks[];
  /**
   * Removes any temp staging directories created by per-target command
   * importers (e.g. the canonical-.md output of Gemini's TOML mapper).
   * Always safe to call. The install pipeline invokes it via
   * `prep.cleanup()` after pack materialization has copied each staged
   * command into the pack tree.
   */
  readonly cleanup: () => Promise<void>;
}

export async function aggregateAnthropicSkillPack(
  contentRoot: string,
  parseOpts: ParseFrontmatterOptions = {},
): Promise<AggregateResult> {
  const [skills, agentsRead, rulesRead, merged] = await Promise.all([
    importSkills(`${contentRoot}/skills`, parseOpts),
    readEntityDirWithMappers(`${contentRoot}/agents`, 'agents', { parseOpts }),
    readEntityDirWithMappers(`${contentRoot}/rules`, 'rules', { parseOpts }),
    mergeCommands(contentRoot, MERGE_FROM_TOOL_DIRS, parseOpts),
  ]);

  const agents = [...agentsRead.entities];
  const rules = [...rulesRead.entities];
  const includedPaths = buildIncludedPaths(contentRoot, skills, agents, merged.commands, rules);
  const brokenLinks = await detectBrokenLinks(
    contentRoot,
    skills,
    agents,
    merged.commands,
    rules,
    includedPaths,
  );

  // Merge per-entity staging cleanups so a plugin shipping non-`.md`
  // mappers for rules/agents (e.g. `.mdc`, `.yaml`) doesn't leak its
  // tmpdir. Best-effort — same lifecycle as the existing command cleanup.
  const cleanup = async (): Promise<void> => {
    await Promise.allSettled([rulesRead.cleanup(), agentsRead.cleanup(), merged.cleanup()]);
  };

  return {
    skills,
    agents,
    commands: merged.commands,
    rules,
    dedups: merged.dedups,
    brokenLinks,
    cleanup,
  };
}
