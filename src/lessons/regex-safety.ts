/**
 * Safety gate for `command_pattern` triggers.
 *
 * Recall is mandatory (it runs before every edit/command) and matches
 * author-supplied patterns against the command string. A backtracking `RegExp`
 * can be driven super-linear by a crafted pattern — `(a+)+`, `(a|aa)+`, `a+a+`,
 * or even `a+b` (quadratic on a long non-matching input) — so one lesson could
 * hang recall. Local inspection of quantifier shape CANNOT prove a backtracking
 * regex linear, so we do not try: command patterns are matched by an in-repo
 * non-backtracking engine ({@link compileLinearMatcher}), which is provably
 * linear in the input length for any pattern it can compile.
 *
 * A pattern is "safe" iff the linear engine can compile it. Patterns it cannot
 * evaluate are dead triggers: capture drops them (DEAD_COMMAND_PATTERN), the
 * write barrier and validate flag stored ones (INVALID_/UNSAFE_TRIGGER_PATTERN),
 * and recall skips them: fail closed.
 */

import { compileLinearMatcher, type LinearMatcher } from './regex-linear/index.js';

/** Patterns longer than this are treated as unsafe outright (defensive bound). */
const MAX_PATTERN_LENGTH = 1000;

/** True when `pattern` can be matched by the linear engine (no ReDoS risk). */
export function isSafeRegexPattern(pattern: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
  return compileLinearMatcher(pattern) !== null;
}

/**
 * Return a linear-time matcher for a `command_pattern` used in recall, or null
 * when the pattern is over-long or outside the engine's support (recall treats
 * null as a non-match, never executing a backtracking regex). Memoized inside
 * {@link compileLinearMatcher}.
 */
export function getCommandMatcher(pattern: string): LinearMatcher | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  return compileLinearMatcher(pattern);
}
