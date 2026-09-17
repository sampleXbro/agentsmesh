/**
 * A1 two-tier bulk prompt for skill-pack install.
 *
 * Walks the user through three optional tiers of confirmation before any pack
 * write happens:
 *
 *   Tier 1  Install [a]ll, [n]one, or [s]elect per type?      [a/n/s]
 *   Tier 2  Install all N <kind>?                              [y/n/c]
 *   Tier 3  Install <kind> "<id>"?                             [y/N/a/q]
 *
 * Special case: when the candidate set contains exactly one entity across all
 * four kinds, the tier-1 selector collapses (`[a]ll` / `[n]one` / `[s]elect`
 * all resolve to the same outcome) — short-circuit to a single y/N
 * confirmation that names the entity directly. Empty input is the documented
 * `N` default (skip); only an unrecognized non-empty response aborts.
 *
 * The function is pure: it owns no streams, asks no questions directly, and
 * returns the user's selection plus an `aborted` flag. A `bypass` option
 * short-circuits the entire walk (used for `--force`, `--json`, and non-TTY
 * invocations).
 *
 * Abort policy: any unrecognized response at tier 1 or tier 2 — including
 * the empty string returned on EOF/Ctrl-D — aborts the run with
 * `aborted = true`. Tier 3 treats the empty string as the documented `N`
 * default (skip current); only an unrecognized non-empty response aborts.
 * The caller maps `aborted = true` onto exit code 130.
 */

import type { PromptAdapter } from './prompt-types.js';

const KIND_ORDER = ['skills', 'agents', 'commands', 'rules'] as const;
type EntityKind = (typeof KIND_ORDER)[number];

const SINGULAR: Readonly<Record<EntityKind, string>> = {
  skills: 'skill',
  agents: 'agent',
  commands: 'command',
  rules: 'rule',
};

export interface BulkCandidates {
  readonly skills: readonly string[];
  readonly agents: readonly string[];
  readonly commands: readonly string[];
  readonly rules: readonly string[];
}

export interface BulkSelection {
  readonly skills: readonly string[];
  readonly agents: readonly string[];
  readonly commands: readonly string[];
  readonly rules: readonly string[];
  readonly aborted: boolean;
}

export interface BulkPromptDeps extends PromptAdapter {}

export interface BulkPromptOptions {
  readonly packName: string;
  /**
   * When true, all candidates are returned without prompting. Set by callers
   * for `--force`, `--json`, or non-TTY invocations.
   */
  readonly bypass: boolean;
}

function emptySelection(aborted: boolean): BulkSelection {
  return { skills: [], agents: [], commands: [], rules: [], aborted };
}

function selectAll(c: BulkCandidates): BulkSelection {
  return {
    skills: [...c.skills],
    agents: [...c.agents],
    commands: [...c.commands],
    rules: [...c.rules],
    aborted: false,
  };
}

function writeBanner(deps: BulkPromptDeps, packName: string, c: BulkCandidates): void {
  const lines: string[] = [`Found in ${packName}:`];
  for (const kind of KIND_ORDER) {
    const items = c[kind];
    if (items.length === 0) continue;
    const label = items.length === 1 ? SINGULAR[kind] : kind;
    lines.push(`  - ${items.length} ${label}`);
  }
  lines.push('');
  deps.write(`${lines.join('\n')}\n`);
}

async function walkType(
  deps: BulkPromptDeps,
  kind: EntityKind,
  ids: readonly string[],
): Promise<{ selected: readonly string[]; aborted: boolean }> {
  if (ids.length === 0) return { selected: [], aborted: false };

  const plural = kind;
  const tier2 = (await deps.ask(`Install all ${ids.length} ${plural}? [y/n/c] `))
    .trim()
    .toLowerCase();

  if (tier2 === 'y') return { selected: [...ids], aborted: false };
  if (tier2 === 'n') return { selected: [], aborted: false };
  if (tier2 !== 'c') return { selected: [], aborted: true };

  const singular = SINGULAR[kind];
  const picked: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const answer = (await deps.ask(`Install ${singular} "${id}"? [y/N/a/q] `)).trim().toLowerCase();
    if (answer === 'y') {
      picked.push(id);
      continue;
    }
    if (answer === '' || answer === 'n') continue;
    if (answer === 'a') {
      for (let j = i; j < ids.length; j++) picked.push(ids[j]!);
      return { selected: picked, aborted: false };
    }
    if (answer === 'q') return { selected: picked, aborted: false };
    return { selected: [], aborted: true };
  }
  return { selected: picked, aborted: false };
}

function findSingleEntity(candidates: BulkCandidates): { kind: EntityKind; id: string } | null {
  let found: { kind: EntityKind; id: string } | null = null;
  for (const kind of KIND_ORDER) {
    for (const id of candidates[kind]) {
      if (found !== null) return null;
      found = { kind, id };
    }
  }
  return found;
}

async function runSingleEntityPrompt(
  deps: BulkPromptDeps,
  entity: { kind: EntityKind; id: string },
): Promise<BulkSelection> {
  const singular = SINGULAR[entity.kind];
  const answer = (await deps.ask(`Install ${singular} "${entity.id}"? [y/N] `))
    .trim()
    .toLowerCase();
  if (answer === 'y') {
    const result = emptySelection(false);
    return { ...result, [entity.kind]: [entity.id] } as BulkSelection;
  }
  // Empty input matches the documented `N` default (skip, not abort) — same
  // semantics as the tier-3 per-entity prompt for consistency.
  if (answer === '' || answer === 'n') return emptySelection(false);
  return emptySelection(true);
}

export async function runBulkPrompt(
  candidates: BulkCandidates,
  options: BulkPromptOptions,
  deps: BulkPromptDeps,
): Promise<BulkSelection> {
  if (options.bypass) return selectAll(candidates);

  const total =
    candidates.skills.length +
    candidates.agents.length +
    candidates.commands.length +
    candidates.rules.length;
  if (total === 0) return emptySelection(false);

  if (total === 1) {
    const single = findSingleEntity(candidates);
    if (single !== null) {
      writeBanner(deps, options.packName, candidates);
      return runSingleEntityPrompt(deps, single);
    }
  }

  writeBanner(deps, options.packName, candidates);

  const tier1 = (await deps.ask('Install [a]ll, [n]one, or [s]elect per type? [a/n/s] '))
    .trim()
    .toLowerCase();

  if (tier1 === 'a') return selectAll(candidates);
  if (tier1 === 'n') return emptySelection(false);
  if (tier1 !== 's') return emptySelection(true);

  const result: { [K in EntityKind]: readonly string[] } = {
    skills: [],
    agents: [],
    commands: [],
    rules: [],
  };
  for (const kind of KIND_ORDER) {
    const { selected, aborted } = await walkType(deps, kind, candidates[kind]);
    if (aborted) return emptySelection(true);
    result[kind] = selected;
  }
  return { ...result, aborted: false };
}
