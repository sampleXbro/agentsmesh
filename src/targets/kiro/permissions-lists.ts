/**
 * List-level conversions between canonical permissions and a Kiro `rules:` list.
 * Per-entry mapping lives in `permissions-format.ts`.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { Permissions } from '../../core/types.js';
import {
  KIRO_EFFECTS,
  kiroRuleKey,
  ruleToCanonicalEntries,
  toKiroRule,
  type KiroEffect,
  type KiroPermissionRule,
} from './permissions-format.js';

function effectEntries(permissions: Permissions, effect: KiroEffect): readonly string[] {
  if (effect === 'allow') return permissions.allow;
  if (effect === 'deny') return permissions.deny;
  return permissions.ask ?? [];
}

/** Every canonical entry Kiro can express, deduped, deny first for readability. */
export function canonicalToKiroRules(permissions: Permissions | null): KiroPermissionRule[] {
  if (!permissions) return [];
  const rules: KiroPermissionRule[] = [];
  const seen = new Set<string>();
  for (const effect of KIRO_EFFECTS) {
    for (const entry of effectEntries(permissions, effect)) {
      const rule = toKiroRule(entry, effect);
      if (!rule) continue;
      const key = kiroRuleKey(rule);
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push(rule);
    }
  }
  return rules;
}

export interface UnmappedKiroEntries {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly ask: readonly string[];
}

/** Canonical entries with no Kiro rule, grouped by list, for lint to name. */
export function unmappedPermissionEntries(permissions: Permissions | null): UnmappedKiroEntries {
  if (!permissions) return { allow: [], deny: [], ask: [] };
  const pick = (effect: KiroEffect): string[] =>
    effectEntries(permissions, effect).filter((entry) => toKiroRule(entry, effect) === null);
  return { allow: pick('allow'), deny: pick('deny'), ask: pick('ask') };
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Read a `rules:` list defensively. Entries carrying `exclude` are skipped
 * outright: canonical has no exclusion, so importing one would silently widen
 * the user's rule into an unrestricted grant.
 */
export function parseKiroRules(value: unknown): KiroPermissionRule[] {
  if (!Array.isArray(value)) return [];
  const rules: KiroPermissionRule[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (raw.exclude !== undefined) continue;
    const { capability, effect } = raw;
    if (typeof capability !== 'string' || typeof effect !== 'string') continue;
    if (!KIRO_EFFECTS.includes(effect as KiroEffect)) continue;
    const match = stringList(raw.match);
    rules.push({
      capability,
      ...(match.length > 0 ? { match } : {}),
      effect: effect as KiroEffect,
    });
  }
  return rules;
}

/** The exact key set agentsmesh writes; anything else marks a hand-written rule. */
const OWNED_RULE_KEYS: ReadonlySet<string> = new Set(['capability', 'match', 'effect']);

/**
 * Whether a rule already on disk is one agentsmesh owns and may rewrite.
 *
 * Ownership is by SHAPE: the rule carries only the keys agentsmesh emits and
 * projects back onto at least one canonical entry. Everything else — an
 * `exclude` list, an extra key, a capability canonical cannot name — belongs to
 * the user and is preserved verbatim, which mirrors the import side skipping
 * `exclude` rules instead of widening them. A hand-written rule that is
 * indistinguishable from a generated one is still rewritten from canonical;
 * that is the price of revocation working.
 */
export function isOwnedKiroRule(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !OWNED_RULE_KEYS.has(key))) return false;
  const [rule] = parseKiroRules([value]);
  return rule !== undefined && ruleToCanonicalEntries(rule).length > 0;
}

/**
 * Fold the imported rules for one effect into that canonical list. Filtering by
 * effect happens here rather than at the call site so a rule can never land in
 * the wrong list.
 *
 * An existing canonical entry that projects to the same rule is kept verbatim,
 * so `Grep` does not come back as `Read` and `Bash(npm test:*)` keeps its
 * canonical prefix form — generate -> import -> generate is a fixed point.
 * Entries Kiro cannot express survive; entries it can express but that are no
 * longer in the file are dropped, so a revoked rule leaves canonical too.
 */
export function mergeImportedEntries(
  existing: readonly string[],
  imported: readonly KiroPermissionRule[],
  effect: KiroEffect,
): string[] {
  const byKey = new Map<string, string[]>();
  const unrepresentable: string[] = [];
  for (const entry of existing) {
    const rule = toKiroRule(entry, effect);
    if (!rule) {
      unrepresentable.push(entry);
      continue;
    }
    const key = kiroRuleKey(rule);
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }

  const out: string[] = [];
  const push = (entry: string): void => {
    if (!out.includes(entry)) out.push(entry);
  };
  for (const rule of imported) {
    if (rule.effect !== effect) continue;
    for (const entry of byKey.get(kiroRuleKey(rule)) ?? ruleToCanonicalEntries(rule)) push(entry);
  }
  for (const entry of unrepresentable) push(entry);
  return out;
}
