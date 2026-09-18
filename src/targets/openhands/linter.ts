/** Lint rules for the openhands target. */
import { AB_ROOT_RULE } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { validateRules } from '../../core/lint/validate-rules.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { openhandsRuleSlug } from './rules-format.js';
import { OPENHANDS_TARGET, OPENHANDS_ROOT_FILE, OPENHANDS_SKILLS_DIR } from './constants.js';

/** AGENTS.md is injected verbatim, so a root rule's metadata has nowhere to go. */
function lintRootMetadata(canonical: CanonicalFiles): LintDiagnostic[] {
  const root = canonical.rules.find((rule) => rule.root);
  if (!root || !root.description) return [];
  return [
    createWarning(
      AB_ROOT_RULE,
      OPENHANDS_TARGET,
      `${OPENHANDS_ROOT_FILE} is injected verbatim — frontmatter would appear as literal ` +
        `prompt text — so the root rule's description ("${root.description}") is dropped.`,
    ),
  ];
}

/** Without `paths:` a rule file is always injected instead of file-scoped. */
function lintUnscopedRules(canonical: CanonicalFiles): LintDiagnostic[] {
  return canonical.rules
    .filter((rule) => !rule.root && rule.globs.length === 0)
    .filter((rule) => rule.targets.length === 0 || rule.targets.includes(OPENHANDS_TARGET))
    .map((rule) => {
      const slug = openhandsRuleSlug(rule);
      return createWarning(
        rule.source,
        OPENHANDS_TARGET,
        `Rule "${slug}" has no globs, so ${OPENHANDS_SKILLS_DIR}/${slug}.md is written without ` +
          `the paths: key and OpenHands injects it into every conversation. Add globs to scope it.`,
      );
    });
}

export function lintRules(
  canonical: CanonicalFiles,
  projectRoot: string,
  projectFiles: string[],
  options?: { scope?: 'project' | 'global' },
): LintDiagnostic[] {
  const base = validateRules(canonical, projectRoot, projectFiles, {
    checkGlobMatches: options?.scope !== 'global',
  }).map((diagnostic) => ({ ...diagnostic, target: OPENHANDS_TARGET }));

  return [...base, ...lintRootMetadata(canonical), ...lintUnscopedRules(canonical)];
}
