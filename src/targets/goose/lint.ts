/**
 * Goose-specific lint warnings.
 *
 * Goose supports lifecycle hooks natively (Open Plugin Specification), so hooks
 * are generated, not warned about. Project MCP is native through the plugin
 * `.mcp.json`, but that parser is stdio-only — remote servers are the lossy part
 * and get named. Project-level permissions have no config file at all. Commands
 * and agents are projected as skills via supportsConversion.
 */

import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import { GOOSE_PROJECT_MCP_FILE } from './constants.js';

export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  // Permissions are native at global scope (~/.config/goose/permission.yaml);
  // only project scope (no permission file) warrants a warning.
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (scope === 'global') return [];
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'goose',
      'Goose applies tool permissions only at global scope (~/.config/goose/permission.yaml); project-scope permissions are not projected.',
    ),
  ];
}

export function lintMcp(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  // Global `config.yaml` extensions carry every transport. The project plugin
  // `.mcp.json` parser models stdio alone, so only remote servers are lossy.
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (scope === 'global') return [];
  if (!canonical.mcp) return [];
  const remote = Object.entries(canonical.mcp.mcpServers)
    .filter(([, server]) => !('command' in server))
    .map(([name]) => name);
  if (remote.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/mcp.json',
      'goose',
      `Goose plugin MCP config (${GOOSE_PROJECT_MCP_FILE}) models stdio servers only ` +
        `(command/args/env/cwd), so remote server(s) are not projected at project scope: ` +
        `${remote.join(', ')}. Goose reads remote servers from the extensions block of ` +
        `~/.config/goose/config.yaml only.`,
    ),
  ];
}

/** Goose retired .gooseignore; legacy import exists for migration only. */
export const lintIgnore = unsupportedFeature('ignore', 'goose',
  'Goose no longer reads .gooseignore; canonical ignore cannot be projected.');
