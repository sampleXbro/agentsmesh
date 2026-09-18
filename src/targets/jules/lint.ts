/**
 * Jules-specific lint hooks.
 *
 * Jules is a cloud-based async coding agent that only reads `AGENTS.md`.
 * It does not support hooks, permissions, ignore, MCP, commands, or
 * skills as standalone config files.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';

export const lintHooks = unsupportedFeature(
  'hooks',
  'jules',
  'Jules has no lifecycle hook system; canonical hooks are not projected.',
);

export const lintPermissions = unsupportedFeature(
  'permissions',
  'jules',
  'Jules has no permissions system; canonical permissions are not projected.',
);

export const lintIgnore = unsupportedFeature(
  'ignore',
  'jules',
  'Jules is a cloud-based agent with no dedicated ignore file; canonical ignore patterns are not projected.',
);

export const lintMcp = unsupportedFeature(
  'mcp',
  'jules',
  'Jules is a cloud-based agent with no MCP support; canonical MCP servers are not projected.',
);

export const lintCommands = unsupportedFeature(
  'commands',
  'jules',
  'Jules has no command system; canonical commands are not projected.',
);

export function lintSkills(canonical: CanonicalFiles): LintDiagnostic[] {
  if (canonical.skills.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/skills',
      'jules',
      'Jules is a cloud-based agent with no skills directory; canonical skills are not projected.',
    ),
  ];
}
