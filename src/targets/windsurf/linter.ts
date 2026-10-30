/**
 * Windsurf target linter — validates canonical files for Windsurf.
 * Windsurf supports rules, workflows, skills, hooks, and embedded agents. Warns when no root rule
 * and for features that still have no project-level mapping.
 */

import { permissionEntries } from '../../core/permissions.js';
import { relative } from 'node:path';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { WINDSURF_TARGET } from './constants.js';

/**
 * Lint rules for Windsurf target.
 * Warns when no root rule and for canonical features Windsurf still cannot project natively
 * or via embedded mappings.
 *
 * @param canonical - Loaded canonical files
 * @param projectRoot - Project root (for relative paths)
 * @param _projectFiles - Unused (Windsurf uses validateRules via globs in non-root rules)
 * @returns Diagnostics for this target
 */
export function lintRules(
  canonical: CanonicalFiles,
  projectRoot: string,
  _projectFiles: string[],
): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const { rules } = canonical;

  if (rules.length > 0) {
    const hasRoot = rules.some((r) => r.root);
    if (!hasRoot) {
      diags.push({
        level: 'warning',
        file: relative(projectRoot, rules[0]!.source),
        target: WINDSURF_TARGET,
        message: 'Windsurf needs a root rule to generate AGENTS.md. Add root: true to a rule.',
      });
    }
  }

  const unsupported: string[] = [];
  if (permissionEntries(canonical.permissions).length > 0) unsupported.push('permissions');

  if (unsupported.length > 0) {
    diags.push({
      level: 'warning',
      file: '.agentsmesh',
      target: WINDSURF_TARGET,
      message: `Windsurf cannot project these features yet: ${unsupported.join(', ')}.`,
    });
  }

  return diags;
}
