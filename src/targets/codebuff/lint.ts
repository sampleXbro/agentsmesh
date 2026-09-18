/**
 * Codebuff lint hooks.
 *
 * Every `partial` capability gets a warning here that NAMES the dropped
 * entries. A silent drop looks identical to a successful generate, and the user
 * only finds out when the agent behaves as if the config were never written.
 */

import { AB_MCP } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { isUrlMcpServer } from '../../core/mcp-servers.js';
import { CODEBUFF_TARGET } from './constants.js';

function scopeOf(options: unknown): TargetLayoutScope {
  if (options === null || typeof options !== 'object') return 'project';
  const scope = (options as { scope?: unknown }).scope;
  return scope === 'global' ? 'global' : 'project';
}

/**
 * The `.agents/mcp.json` server schema is a STRICT union, and one unknown key
 * makes freebuff discard the entire file (see `mcp-format.ts`). Everything the
 * serializer has to drop is named here.
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
        CODEBUFF_TARGET,
        `Codebuff .agents/mcp.json validates each server with a strict schema that has no description key, so the canonical description is dropped for: ${described.join(', ')}.`,
      ),
    );
  }

  const remoteWithEnv = servers
    .filter(([, server]) => isUrlMcpServer(server) && Object.keys(server.env).length > 0)
    .map(([name]) => name);
  if (remoteWithEnv.length > 0) {
    diagnostics.push(
      createWarning(
        AB_MCP,
        CODEBUFF_TARGET,
        `Codebuff resolves $VAR references only for command servers; the remote schema has no env key, so the canonical env is dropped for: ${remoteWithEnv.join(', ')}. Move the values into headers.`,
      ),
    );
  }

  return diagnostics;
}

export function lintAgents(canonical: CanonicalFiles): LintDiagnostic[] {
  if (canonical.agents.length === 0) return [];
  const names = canonical.agents.map((agent) => agent.name).join(', ');
  return [
    createWarning(
      '.agentsmesh/agents',
      CODEBUFF_TARGET,
      `Codebuff agents are executable TypeScript modules (\`export default definition satisfies AgentDefinition\`) that also need .agents/types/agent-definition.ts; agentsmesh generates config, not code, so these agents are not projected: ${names}.`,
    ),
  ];
}

export function lintPermissions(canonical: CanonicalFiles): LintDiagnostic[] {
  const permissions = canonical.permissions;
  if (!permissions) return [];
  const entries = [...permissions.allow, ...permissions.deny, ...(permissions.ask ?? [])];
  if (entries.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      CODEBUFF_TARGET,
      `Codebuff expresses permissions only as toolNames / spawnableAgents inside a TypeScript agent module, so these canonical entries are not projected: ${entries.join(', ')}.`,
    ),
  ];
}

export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.hooks) return [];
  const events = Object.entries(canonical.hooks)
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .map(([event]) => event);
  if (events.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/hooks.yaml',
      CODEBUFF_TARGET,
      `Codebuff file-change hooks are supplied by the embedding client at runtime, not by a config file, so these canonical hook events are not projected: ${events.join(', ')}.`,
    ),
  ];
}

export function lintIgnore(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (scopeOf(options) !== 'global') return [];
  if (canonical.ignore.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/ignore',
      CODEBUFF_TARGET,
      `Codebuff resolves ignore files per project (.gitignore, .codebuffignore, .manicodeignore); there is no home-directory equivalent, so these patterns are not projected in global mode: ${canonical.ignore.join(', ')}.`,
    ),
  ];
}
