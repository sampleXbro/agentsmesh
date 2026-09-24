import { relative } from 'node:path';
import type { CanonicalRule } from '../../core/types.js';

export interface SettledRootRule {
  readonly rules: CanonicalRule[];
  /** The root rule that stays, if any. */
  readonly root: CanonicalRule | undefined;
  /** Rules that said `root: true` but are now used as normal rules. */
  readonly demoted: CanonicalRule[];
}

/**
 * Keep one root rule after the extends → packs → local merge: the project's
 * own, else an installed pack's, else an extend's (the first in merge order).
 * Every other `root: true` rule becomes a normal rule, so a pack or an extend
 * can never replace the project's root instructions. `local` and `packs` are
 * the layer lists the merge took its rule objects from.
 */
export function settleRootRule(
  merged: readonly CanonicalRule[],
  local: readonly CanonicalRule[],
  packs: readonly CanonicalRule[],
): SettledRootRule {
  const roots = merged.filter((rule) => rule.root);
  const root =
    roots.find((rule) => local.includes(rule)) ??
    roots.find((rule) => packs.includes(rule)) ??
    roots[0];
  const demoted = roots.filter((rule) => rule !== root);
  return {
    rules: merged.map((rule) => (demoted.includes(rule) ? { ...rule, root: false } : rule)),
    root,
    demoted,
  };
}

/** The warning for a rule `settleRootRule` demoted; paths relative to `baseDir`. */
export function demotedRootMessage(
  rule: CanonicalRule,
  root: CanonicalRule,
  baseDir: string,
): string {
  const shown = (r: CanonicalRule): string => relative(baseDir, r.source).replaceAll('\\', '/');
  return (
    `[agentsmesh] Rule "${shown(rule)}" also says root: true, but "${shown(root)}" is the root rule ` +
    "(the project's own root wins over installed packs, and packs over extends), so it is used " +
    'as a normal rule.'
  );
}
