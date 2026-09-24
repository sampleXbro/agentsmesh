/**
 * Skill-pack install-time prompt flow.
 *
 * Runs between `resolveInstallDiscovery` and `executeRunInstallPoolsAndWrite`
 * when the multi-signal classifier picked `anthropic-skill-pack`:
 *
 *   1. Broken-link prompt (per entity) - B1.
 *   2. apply-decisions: mutates the aggregate (skills get supportingFiles +
 *      body link rewrites; non-skill warnings are emitted).
 *   3. Bulk-prompt (A1) - filters the canonical entity set per user choice.
 *
 * Aborts at either prompt raise `InstallAbortError`, which the orchestrator
 * (`runInstall`) maps to exit code 130.
 *
 * Non-interactive callers (`--force`, `--json`, non-TTY): both prompts are
 * bypassed - broken links default to leave-with-warnings, bulk-prompt
 * accepts all entities.
 */

import { basename } from 'node:path';
import { readLine } from '../prompts/prompt-io.js';
import { runBrokenLinkPrompt, type BrokenLinkDecision } from '../prompts/broken-link-prompt.js';
import { runBulkPrompt, type BulkCandidates, type BulkSelection } from '../prompts/bulk-prompt.js';
import type { PromptAdapter } from '../prompts/prompt-types.js';
import { logger, writeOutput } from '../../utils/output/logger.js';
import { applyBrokenLinkDecisions } from '../../sources/anthropic-skill-pack/apply-decisions.js';
import type { AggregateResult } from '../../sources/anthropic-skill-pack/aggregate.js';
import { ruleSlug } from '../core/validate-resources.js';
import type { CanonicalFiles } from '../../core/types.js';
import { InstallAbortError } from './install-abort-error.js';

export interface SkillPackPromptFlowArgs {
  readonly contentRoot: string;
  readonly aggregate: AggregateResult;
  readonly narrowed: CanonicalFiles;
  readonly bypass: boolean;
  readonly displayName: string;
  readonly adapter?: PromptAdapter;
}

export interface SkillPackPromptFlowResult {
  readonly aggregate: AggregateResult;
  readonly narrowed: CanonicalFiles;
  readonly discoveredFeatures: string[];
}

function defaultAdapter(): PromptAdapter {
  return {
    ask: (prompt: string) => readLine(prompt),
    write: writeOutput,
  };
}

function bulkCandidatesFrom(aggregate: AggregateResult): BulkCandidates {
  return {
    skills: aggregate.skills.map((s) => s.name),
    agents: aggregate.agents.map((a) => a.name),
    commands: aggregate.commands.map((c) => c.name),
    rules: aggregate.rules.map((r) => ruleSlug(r)),
  };
}

function filterCanonical(aggregate: AggregateResult, selection: BulkSelection): CanonicalFiles {
  const skillSet = new Set(selection.skills);
  const agentSet = new Set(selection.agents);
  const cmdSet = new Set(selection.commands);
  const ruleSet = new Set(selection.rules);
  return {
    skills: aggregate.skills.filter((s) => skillSet.has(s.name)),
    agents: aggregate.agents.filter((a) => agentSet.has(a.name)),
    commands: aggregate.commands.filter((c) => cmdSet.has(c.name)),
    rules: aggregate.rules.filter((r) => ruleSet.has(ruleSlug(r))),
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

function discoveredFeaturesOf(canonical: CanonicalFiles): string[] {
  const out: string[] = [];
  if (canonical.skills.length > 0) out.push('skills');
  if (canonical.rules.length > 0) out.push('rules');
  if (canonical.commands.length > 0) out.push('commands');
  if (canonical.agents.length > 0) out.push('agents');
  return out;
}

export async function runSkillPackPromptFlow(
  args: SkillPackPromptFlowArgs,
): Promise<SkillPackPromptFlowResult> {
  const adapter = args.adapter ?? defaultAdapter();

  const brokenLinkResult = await runBrokenLinkPrompt(
    args.aggregate.brokenLinks,
    { bypass: args.bypass },
    adapter,
  );
  if (brokenLinkResult.aborted) {
    throw new InstallAbortError('User aborted at broken-link prompt.');
  }

  const decisions: BrokenLinkDecision[] = [...brokenLinkResult.decisions];
  const mutated = await applyBrokenLinkDecisions({
    contentRoot: args.contentRoot,
    aggregate: args.aggregate,
    decisions,
    logger,
  });

  const candidates = bulkCandidatesFrom(mutated);
  const totalCount =
    candidates.skills.length +
    candidates.agents.length +
    candidates.commands.length +
    candidates.rules.length;
  if (totalCount === 0) {
    return {
      aggregate: mutated,
      narrowed: filterCanonical(mutated, {
        skills: [],
        agents: [],
        commands: [],
        rules: [],
        aborted: false,
      }),
      discoveredFeatures: [],
    };
  }

  const selection = await runBulkPrompt(
    candidates,
    { packName: args.displayName, bypass: args.bypass },
    adapter,
  );
  if (selection.aborted) {
    throw new InstallAbortError('User aborted at bulk-select prompt.');
  }

  const narrowed = filterCanonical(mutated, selection);
  return {
    aggregate: mutated,
    narrowed,
    discoveredFeatures: discoveredFeaturesOf(narrowed),
  };
}

export function displayNameForContentRoot(contentRoot: string): string {
  return basename(contentRoot) || 'install source';
}

/**
 * Conditional shim used by `runInstallLocked`. When `discovery.aggregate`
 * is absent (non skill-pack paths), returns `aborted: false` and undefined
 * narrowed values so the caller keeps using the discovery defaults. Maps
 * `InstallAbortError` to `aborted: true` and logs the abort message so the
 * orchestrator can surface exit code 130 without leaking the throw.
 */
export async function runPromptFlowWithAbort(args: {
  readonly discovery: {
    readonly aggregate?: import('../../sources/anthropic-skill-pack/aggregate.js').AggregateResult;
    readonly narrowed: CanonicalFiles;
  };
  readonly contentRoot: string;
  readonly bypass: boolean;
}): Promise<{
  readonly aborted: boolean;
  readonly narrowed?: CanonicalFiles;
  readonly discoveredFeatures?: string[];
}> {
  if (!args.discovery.aggregate) return { aborted: false };
  try {
    const flow = await runSkillPackPromptFlow({
      contentRoot: args.contentRoot,
      aggregate: args.discovery.aggregate,
      narrowed: args.discovery.narrowed,
      bypass: args.bypass,
      displayName: displayNameForContentRoot(args.contentRoot),
    });
    return {
      aborted: false,
      narrowed: flow.narrowed,
      discoveredFeatures: flow.discoveredFeatures,
    };
  } catch (err) {
    if (err instanceof InstallAbortError) {
      logger.warn(err.message);
      return { aborted: true };
    }
    throw err;
  }
}
