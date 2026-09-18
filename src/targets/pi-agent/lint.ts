/**
 * Pi Coding Agent-specific lint hooks.
 *
 * Pi does not support hooks or ignore as standalone config files, and has no
 * MCP surface at all (mcp=none; silent-drop applies). Permissions project onto
 * the `defaultTools` allow-list in settings.json, which is coarse enough that
 * most of a canonical permissions file is dropped — see `lintPermissions`.
 * Commands are native (.pi/prompts/); agents are projected as skills via
 * supportsConversion.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import {
  buildDefaultTools,
  hasPermissionEntries,
  unmappedPermissionEntries,
  PI_BUILTIN_TOOLS,
} from './permissions-format.js';
import { PI_AGENT_TARGET } from './constants.js';

export const lintHooks = unsupportedFeature(
  'hooks',
  'pi-agent',
  'Pi Agent hooks are supported via extensions at .pi/extensions/; agentsmesh does not generate extension files yet. Configure hooks manually.',
);

/**
 * `defaultTools` is an allow-list over eight built-in tool names, so four
 * separate losses have to be named: allow entries with no built-in (every
 * `Bash(...)` command pattern and `Read(...)` path glob included), the whole
 * deny list, the whole ask list, and the built-ins the emitted array leaves
 * switched off — writing the key disables everything it omits.
 */
export function lintPermissions(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!hasPermissionEntries(canonical.permissions)) return [];
  const unmapped = unmappedPermissionEntries(canonical.permissions);
  const diagnostics: LintDiagnostic[] = [];
  const warn = (message: string): number =>
    diagnostics.push(createWarning(AB_PERMISSIONS, PI_AGENT_TARGET, message));

  if (unmapped.allow.length > 0) {
    warn(
      `Pi defaultTools is an allow-list over the built-ins ${PI_BUILTIN_TOOLS.join(', ')}: it has no per-command or per-path matching, so ${unmapped.allow.join(', ')} are dropped.`,
    );
  }
  if (unmapped.deny.length > 0) {
    warn(`Pi has no deny list; ${unmapped.deny.join(', ')} are dropped.`);
  }
  if (unmapped.ask.length > 0) {
    warn(`Pi has no ask tier; ${unmapped.ask.join(', ')} are dropped.`);
  }

  const enabled = buildDefaultTools(canonical.permissions);
  // `powershell` has no canonical name, so something is always switched off.
  const disabled = PI_BUILTIN_TOOLS.filter((tool) => !enabled.includes(tool));
  warn(
    `Writing defaultTools disables every built-in it omits: ${disabled.join(', ')} are switched off at startup, where canonical only left them unapproved.${
      enabled.length === 0
        ? ' Canonical pre-approves no Pi built-in at all, so Pi starts with no tools; add bare tool names (Read, Bash, Edit, Write, Grep, Glob, LS) to allow, or drop permissions from the pi-agent feature list.'
        : ''
    }`,
  );
  return diagnostics;
}

export const lintIgnore = unsupportedFeature(
  'ignore',
  'pi-agent',
  'Pi Coding Agent has no dedicated ignore file and relies on .gitignore; canonical ignore patterns are not projected.',
);
