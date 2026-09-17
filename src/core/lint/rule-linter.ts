import type { CanonicalFiles, LintDiagnostic } from '../types.js';
import { validateRules } from './validate-rules.js';

/** Signature every target's `lintRules` hook implements. */
export type TargetRuleLinter = (
  canonical: CanonicalFiles,
  projectRoot: string,
  projectFiles: string[],
  options?: { scope?: 'project' | 'global' },
) => LintDiagnostic[];

/**
 * The default rule linter: canonical rule validation tagged with `target`.
 * Glob-match checking is skipped in global scope, where there is no project
 * tree to match against. Targets needing extra checks concat onto this.
 */
export function createRuleLinter(target: string): TargetRuleLinter {
  return (canonical, projectRoot, projectFiles, options) =>
    validateRules(canonical, projectRoot, projectFiles, {
      checkGlobMatches: options?.scope !== 'global',
    }).map((diagnostic) => ({ ...diagnostic, target }));
}
