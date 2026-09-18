/**
 * Kimi Code lint hooks.
 *
 * Hooks and permissions exist only in the user-level `~/.kimi-code/config.toml`
 * — the CLI documents no project settings file — so both warn for project scope
 * and, at global scope, name every canonical entry the strict TOML schema
 * refuses. Agent frontmatter drops are reported by `lintAgents`.
 */

import { AB_HOOKS } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { KIMI_CODE_HOOK_EVENTS, unmappedHookEntries } from './hooks-format.js';
import { unmappedPermissionPatterns } from './permissions-format.js';
import { hasIgnoredRemoteEnv, isLoadableKimiMcpServer } from './mcp-format.js';
import { KIMI_CODE_TARGET } from './constants.js';

const CANONICAL_PERMISSIONS = '.agentsmesh/permissions.yaml';
const CANONICAL_MCP = '.agentsmesh/mcp.json';

function scopeOf(options: unknown): TargetLayoutScope | undefined {
  return (options as { scope?: TargetLayoutScope } | undefined)?.scope;
}

function warn(file: string, message: string): LintDiagnostic {
  return createWarning(file, KIMI_CODE_TARGET, message);
}

function hasHookEntries(canonical: CanonicalFiles): boolean {
  if (!canonical.hooks) return false;
  return Object.values(canonical.hooks).some((list) => Array.isArray(list) && list.length > 0);
}

export function lintHooks(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (!hasHookEntries(canonical)) return [];
  if (scopeOf(options) !== 'global') {
    return [
      warn(
        AB_HOOKS,
        'Kimi Code reads hooks only from the user-level ~/.kimi-code/config.toml ([[hooks]]); there is no project config.toml, so canonical hooks are not projected for the project.',
      ),
    ];
  }

  const { events, promptEvents, timeouts } = unmappedHookEntries(canonical.hooks);
  const diagnostics: LintDiagnostic[] = [];
  if (events.length > 0) {
    diagnostics.push(
      warn(
        AB_HOOKS,
        `Kimi Code defines ${KIMI_CODE_HOOK_EVENTS.length} hook events and rejects the whole config.toml on an unknown one, so these events are not projected: ${events.join(', ')}.`,
      ),
    );
  }
  if (promptEvents.length > 0) {
    diagnostics.push(
      warn(
        AB_HOOKS,
        `Kimi Code [[hooks]] runs shell commands only; prompt-type hooks under these events are not projected: ${promptEvents.join(', ')}.`,
      ),
    );
  }
  if (timeouts.length > 0) {
    diagnostics.push(
      warn(
        AB_HOOKS,
        `Kimi Code accepts an integer hook timeout of 1–600 seconds; the timeout is dropped (default 30s applies) for these events: ${timeouts.join(', ')}.`,
      ),
    );
  }
  return diagnostics;
}

export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  const permissions = canonical.permissions;
  if (!permissions) return [];
  const total = permissions.allow.length + permissions.deny.length + (permissions.ask?.length ?? 0);
  if (total === 0) return [];

  if (scopeOf(options) !== 'global') {
    return [
      warn(
        CANONICAL_PERMISSIONS,
        'Kimi Code reads permission rules only from the user-level ~/.kimi-code/config.toml ([[permission.rules]]); there is no project config.toml, so canonical permissions are not projected for the project.',
      ),
    ];
  }

  const unmapped = unmappedPermissionPatterns(permissions);
  if (unmapped.length === 0) return [];
  return [
    warn(
      CANONICAL_PERMISSIONS,
      `Kimi Code refuses a config.toml carrying a [[permission.rules]] pattern its parser rejects; a pattern must not be blank and, once it opens a "(", must name a tool before it and close it, so these entries are not projected: ${unmapped.join(', ')}.`,
    ),
  ];
}

/** One rejected server throws in `parseMcpJsonServers`, refusing the whole file. */
export function lintMcp(canonical: CanonicalFiles): LintDiagnostic[] {
  const entries = Object.entries(canonical.mcp?.mcpServers ?? {});
  const unloadable = entries.filter(([, s]) => !isLoadableKimiMcpServer(s)).map(([name]) => name);
  const remoteEnv = entries.filter(([, s]) => hasIgnoredRemoteEnv(s)).map(([name]) => name);

  const diagnostics: LintDiagnostic[] = [];
  if (unloadable.length > 0) {
    diagnostics.push(
      warn(
        CANONICAL_MCP,
        `Kimi Code refuses the whole .kimi-code/mcp.json when one server fails its schema (an absolute url, a non-empty command), so these servers are not projected: ${unloadable.join(', ')}.`,
      ),
    );
  }
  if (remoteEnv.length > 0) {
    diagnostics.push(
      warn(
        CANONICAL_MCP,
        `Kimi Code defines env only for stdio servers, so env is dropped for these remote servers: ${remoteEnv.join(', ')}.`,
      ),
    );
  }
  return diagnostics;
}

const DROPPED_AGENT_FIELDS = [
  ['model', (agent: CanonicalFiles['agents'][number]) => agent.model !== ''],
  ['permissionMode', (agent: CanonicalFiles['agents'][number]) => agent.permissionMode !== ''],
  ['maxTurns', (agent: CanonicalFiles['agents'][number]) => agent.maxTurns > 0],
  ['mcpServers', (agent: CanonicalFiles['agents'][number]) => agent.mcpServers.length > 0],
  ['hooks', (agent: CanonicalFiles['agents'][number]) => Object.keys(agent.hooks).length > 0],
  ['skills', (agent: CanonicalFiles['agents'][number]) => agent.skills.length > 0],
  ['memory', (agent: CanonicalFiles['agents'][number]) => agent.memory !== ''],
] as const;

/** Kimi Code agent frontmatter has no home for these canonical fields. */
export function lintAgents(canonical: CanonicalFiles): LintDiagnostic[] {
  return canonical.agents.flatMap((agent) => {
    const dropped = DROPPED_AGENT_FIELDS.filter(([, has]) => has(agent)).map(([field]) => field);
    if (dropped.length === 0) return [];
    return [
      warn(
        agent.source,
        `Kimi Code agent frontmatter defines name, description, tools and disallowedTools only; these fields are not projected: ${dropped.join(', ')}.`,
      ),
    ];
  });
}
