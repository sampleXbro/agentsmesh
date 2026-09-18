/**
 * Antigravity-specific lint hooks.
 */

import { AB_MCP, AB_PERMISSIONS } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { ANTIGRAVITY_DROPPED_AGENT_FIELDS, hasAgentValue } from './agents-format.js';
import { ANTIGRAVITY_TARGET } from './constants.js';

/**
 * Project-scope permissions live outside the repo (`~/.gemini/config/projects/`),
 * so nothing repo-writable exists; globally the settings file IS written and
 * all three lists map one-to-one, so there is nothing to warn about.
 */
export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];

  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (scope === 'global') return [];
  return [
    createWarning(
      AB_PERMISSIONS,
      ANTIGRAVITY_TARGET,
      'Antigravity stores per-project permissions outside the repository (~/.gemini/config/projects/), so nothing is projected for the project; generate with --global to write ~/.gemini/antigravity-cli/settings.json instead.',
    ),
  ];
}

/**
 * Warn per agent, naming exactly which canonical fields Antigravity ignores.
 * agentsmesh still writes them as inert frontmatter so import stays lossless —
 * what is lost is Antigravity acting on them. Scope-independent: one agent format.
 *
 * Wired as `generators.lint`, the only per-target lint hook that is not gated on
 * the `rules` feature. It fires whenever lint runs, including feature sets that
 * enable `agents` alone.
 */
export function lintAgents(canonical: CanonicalFiles): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  for (const agent of canonical.agents) {
    const dropped = ANTIGRAVITY_DROPPED_AGENT_FIELDS.filter((field) =>
      hasAgentValue(agent, field),
    ).sort();
    if (dropped.length === 0) continue;
    diagnostics.push(
      createWarning(
        agent.source,
        ANTIGRAVITY_TARGET,
        'Antigravity subagent frontmatter supports only name, description, tools, model, ' +
          `subagent, mainAgent, commandExecutionPolicy, skills and plugins; it ignores canonical ${dropped.join(', ')} ` +
          '(preserved on disk for round-trips, but never applied).',
      ),
    );
  }
  return diagnostics;
}

/**
 * `mcp_config.json` has no `description` and no `type`: the documented key set is
 * `command`/`args`/`env`/`cwd`/`serverUrl`/`headers`/`authProviderType`/`oauth`/
 * `disabled`/`disabledTools`. A local server loses nothing (`command` implies the
 * transport), but a remote one does — `serverUrl` alone cannot say `sse`.
 */
export function lintMcp(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.mcp) return [];
  const servers = Object.entries(canonical.mcp.mcpServers);
  const diagnostics: LintDiagnostic[] = [];

  const described = servers
    .filter(([, server]) => (server.description ?? '').length > 0)
    .map(([name]) => name);
  if (described.length > 0) {
    diagnostics.push(
      createWarning(
        AB_MCP,
        ANTIGRAVITY_TARGET,
        `Antigravity mcp_config.json has no description field; the canonical description is dropped for: ${described.join(', ')}.`,
      ),
    );
  }

  const remote = servers.filter(([, server]) => 'url' in server).map(([name]) => name);
  if (remote.length > 0) {
    diagnostics.push(
      createWarning(
        AB_MCP,
        ANTIGRAVITY_TARGET,
        `Antigravity mcp_config.json has no type field; a remote server is written as serverUrl and Antigravity negotiates the transport itself, so the canonical type is dropped for: ${remote.join(', ')}.`,
      ),
    );
  }

  return diagnostics;
}
