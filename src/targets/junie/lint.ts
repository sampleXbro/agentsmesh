/**
 * Junie-specific lint hooks.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { isUrlMcpServer } from '../../core/mcp-servers.js';
import { createWarning } from '../../core/lint/shared/helpers.js';

export function lintMcp(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];

  const diagnostics: LintDiagnostic[] = [];
  for (const [name, server] of Object.entries(canonical.mcp.mcpServers)) {
    if (isUrlMcpServer(server)) {
      diagnostics.push(
        createWarning(
          '.agentsmesh/mcp.json',
          'junie',
          `MCP server "${name}" uses ${server.type} transport; Junie project mcp.json currently documents stdio MCP servers only.`,
        ),
      );
    }
  }
  return diagnostics;
}

export const lintHooks = unsupportedFeature(
  'hooks',
  'junie',
  'Junie project hooks require --config-location to take effect; hooks from the default project config file are ignored by Junie for safety. Use ~/.junie/config.json for personal hooks (global scope).',
);

export function lintPermissions(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow = [], deny = [], ask = [] } = canonical.permissions;
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'junie',
      'Junie project config supports only a coarse brave boolean flag (auto-approve mode); granular allow/deny/ask rules are not available at project scope. Use ~/.junie/allowlist.json (global scope) for fine-grained permissions.',
    ),
  ];
}
