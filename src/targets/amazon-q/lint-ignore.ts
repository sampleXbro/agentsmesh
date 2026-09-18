/**
 * Ignore lint for Amazon Q Developer.
 *
 * Patterns become `toolsSettings.<tool>.deniedPaths` inside every generated agent JSON.
 * Four fidelity gaps get a warning: no agent to carry them, the selected-agent
 * conditionality, gitignore semantics Amazon Q does not reproduce, and the loss of
 * Amazon Q's per-agent deny scope.
 */

import { AB_IGNORE } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { AQ_DENIED_PATH_TOOLS, isNegatedPattern } from './agent-json.js';
import { AMAZON_Q_TARGET } from './constants.js';

/**
 * Amazon Q anchors each denied path to the working directory before building a glob
 * (`canonicalizes_path` + `add_gitignore_globs`), so a separator-free gitignore
 * pattern loses its match-at-any-depth behaviour.
 */
function isDepthAnchored(pattern: string): boolean {
  return !pattern.replace(/\/$/, '').includes('/');
}

function ignoreWarning(message: string): LintDiagnostic {
  return createWarning(AB_IGNORE, AMAZON_Q_TARGET, message);
}

export function lintIgnore(canonical: CanonicalFiles): LintDiagnostic[] {
  const patterns = canonical.ignore;
  if (patterns.length === 0) return [];

  const tools = AQ_DENIED_PATH_TOOLS.join('/');
  if (canonical.agents.length === 0) {
    return [
      ignoreWarning(
        `Amazon Q CLI has no ignore file; patterns are embedded as ${tools} deniedPaths ` +
          `inside generated agent JSON. No agents exist in .agentsmesh/agents, so all ` +
          `${patterns.length} ignore pattern(s) are dropped.`,
      ),
    ];
  }

  const diagnostics = [
    ignoreWarning(
      `Amazon Q deniedPaths apply only while a generated agent is selected ` +
        `(q chat --agent <name>, or q settings chat.defaultAgent); the built-in ` +
        `default agent carries no toolsSettings.`,
    ),
  ];

  const anchored = patterns.filter((p) => !isNegatedPattern(p) && isDepthAnchored(p));
  if (anchored.length > 0) {
    diagnostics.push(
      ignoreWarning(
        `Amazon Q resolves each denied path against the working directory, so ` +
          `${anchored.join(', ')} match only at the project root, not at every depth ` +
          `like gitignore. Prefix with "**/" for gitignore-equivalent reach.`,
      ),
    );
  }

  const negated = patterns.filter(isNegatedPattern);
  if (negated.length > 0) {
    diagnostics.push(
      ignoreWarning(
        `Amazon Q deniedPaths has no negation, so re-inclusion pattern(s) ` +
          `${negated.join(', ')} are dropped and the surrounding deny stays in force.`,
      ),
    );
  }

  if (canonical.agents.length > 1) {
    const names = canonical.agents.map((agent) => agent.name).join(', ');
    diagnostics.push(
      ignoreWarning(
        `Amazon Q scopes deniedPaths per-agent, canonical ignore does not: ` +
          `${patterns.filter((p) => !isNegatedPattern(p)).join(', ')} are written to all ` +
          `${canonical.agents.length} generated agents (${names}). Importing from Amazon Q ` +
          `unions deniedPaths across agents the same way, so a deny that existed in one ` +
          `agent widens to every agent on the next generate.`,
      ),
    );
  }

  return diagnostics;
}
