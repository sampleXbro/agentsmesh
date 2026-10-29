/** Merge Claude Code settings safely when the ignore projection writes Read denies. */
import type { GenerateResult } from '../../core/types.js';
import { mergeSettingsJson } from '../../core/generate/settings.js';
import { CLAUDE_SETTINGS } from './constants.js';

export function mergeClaudeSettingsIgnore(
  existing: string | null,
  pending: GenerateResult | undefined,
  next: string,
  path: string,
): string | null {
  if (path !== CLAUDE_SETTINGS) return null;
  const base = pending?.content ?? existing;
  if (base === null) return next;
  let overlay: Record<string, unknown>;
  let before: Record<string, unknown>;
  try {
    overlay = JSON.parse(next) as Record<string, unknown>;
    before = JSON.parse(base) as Record<string, unknown>;
  } catch {
    return mergeSettingsJson(base, next);
  }
  const incoming = overlay.permissions as Record<string, unknown> | undefined;
  const original = before.permissions as Record<string, unknown> | undefined;
  // An ignore-only output has deny but no allow/ask. It arrives last, after
  // the explicit permissions generator, and MUST NOT replace those denies.
  if (incoming && Array.isArray(incoming.deny) &&
      !Object.hasOwn(incoming, 'allow') && !Object.hasOwn(incoming, 'ask')) {
    const denied = Array.isArray(original?.deny) ? original.deny : [];
    const combined = [...new Set([...denied, ...incoming.deny])];
    return mergeSettingsJson(base, JSON.stringify({ permissions: { deny: combined } }));
  }
  return mergeSettingsJson(base, next);
}
