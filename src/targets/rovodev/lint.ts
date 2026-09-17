/**
 * Rovo Dev-specific lint hooks.
 *
 * Rovo Dev does not support ignore as a standalone config file.
 * Hooks and permissions are emitted via emitScopedSettings (global only).
 * Commands are native (`.rovodev/prompts.yml`); agents are projected as
 * skills via supportsConversion. MCP has no project-level config file — only
 * `~/.rovodev/mcp_config.json` (global).
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';

export const lintIgnore = unsupportedFeature(
  'ignore',
  'rovodev',
  'Rovo Dev has no dedicated ignore file and relies on .gitignore; canonical ignore patterns are not projected.',
);

export function lintMcp(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (scope === 'global') return [];
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/mcp.json',
      'rovodev',
      'Rovo Dev only reads MCP servers from ~/.rovodev/mcp_config.json (global); project-level MCP is not projected.',
    ),
  ];
}
