/**
 * Shared lint helper utilities for target-specific linters.
 */

import { isBestEffortHookEvent } from '../../hook-types.js';
import type { LintDiagnostic } from '../../types.js';

/**
 * Create a warning diagnostic for a canonical file.
 */
export function createWarning(file: string, target: string, message: string): LintDiagnostic {
  return {
    level: 'warning',
    file,
    target,
    message,
  };
}

/** Format a list for prose: "a", "a and b", or "a, b, and c". */
const PROSE_LIST = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/**
 * Canonical hook event names a target with the given `supportedEvents` whitelist
 * should WARN about (present in canonical hooks, not supported). Excludes
 * BEST_EFFORT_HOOK_EVENTS while they carry only the agentsmesh-injected recall
 * hook: dropping that is not user data loss, so a warning would be permanent and
 * unfixable. Every whitelist-style hook linter routes its unsupported-event set
 * through here so the best-effort exclusion is applied once, uniformly.
 */
export function unsupportedHookEventNames(
  hooks: Record<string, unknown> | null | undefined,
  supportedEvents: readonly string[],
): string[] {
  if (!hooks) return [];
  const supported = new Set(supportedEvents);
  return Object.keys(hooks).filter(
    (event) => !supported.has(event) && !isBestEffortHookEvent(event, hooks[event]),
  );
}

/**
 * Create a warning for unsupported hook events.
 * @param unsupportedBy - Phrase after "is not supported by" (defaults to `target`, e.g. "Copilot hooks").
 */
export function createUnsupportedHookWarning(
  event: string,
  target: string,
  supportedEvents: readonly string[],
  options?: { unsupportedBy?: string },
): LintDiagnostic {
  const by = options?.unsupportedBy ?? target;
  const supported = PROSE_LIST.format(supportedEvents);
  return createWarning(
    '.agentsmesh/hooks.yaml',
    target,
    `${event} is not supported by ${by}; only ${supported} are projected.`,
  );
}
