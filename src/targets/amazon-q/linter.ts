/**
 * Amazon Q Developer rule linter.
 *
 * Uses the shared rule validator with glob matching enabled in project scope, and
 * warns when generated global rules have nothing to load them: Q CLI has no global
 * rules directory, so `.aws/amazonq/rules/*.md` is reachable only through the
 * `resources` glob written into a generated agent JSON.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { validateRules } from '../../core/lint/validate-rules.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { isAmazonQRule } from './agent-json.js';
import { AMAZON_Q_TARGET } from './constants.js';

export function lintRules(
  canonical: CanonicalFiles,
  projectRoot: string,
  projectFiles: string[],
  options?: { scope?: 'project' | 'global' },
): LintDiagnostic[] {
  const isGlobal = options?.scope === 'global';
  const diagnostics = validateRules(canonical, projectRoot, projectFiles, {
    checkGlobMatches: !isGlobal,
  }).map((diagnostic) => ({
    ...diagnostic,
    target: AMAZON_Q_TARGET,
  }));

  if (isGlobal && canonical.rules.some(isAmazonQRule)) {
    diagnostics.push(unreachableGlobalRulesWarning(canonical));
  }

  return diagnostics;
}

/**
 * Global rules are only ever read through an agent JSON `resources` glob, so the
 * warning has two shapes: nothing loads them at all, or they load only while one of
 * the generated agents is selected. `lintIgnore` states the same caveat for
 * deniedPaths — both ride the same conditional surface.
 */
function unreachableGlobalRulesWarning(canonical: CanonicalFiles): LintDiagnostic {
  const names = canonical.agents.map((agent) => agent.name);
  const message =
    names.length === 0
      ? 'Amazon Q CLI has no global rules directory; generated global rules are loaded ' +
        'only through the resources glob in an agent JSON. Add an agent to ' +
        '.agentsmesh/agents so the rules are read.'
      : `Amazon Q CLI has no global rules directory; generated global rules are loaded ` +
        `only while one of the generated agents (${names.join(', ')}) is selected ` +
        `(q chat --agent <name>, or q settings chat.defaultAgent). The built-in default ` +
        `agent never reads them.`;
  return createWarning(AB_RULES, AMAZON_Q_TARGET, message);
}
