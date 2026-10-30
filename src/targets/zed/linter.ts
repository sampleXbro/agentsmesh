/** Lint rules for the zed target, plus the settings.json writability guard. */
import { permissionEntries } from '../../core/permissions.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { validateRules } from '../../core/lint/validate-rules.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { parseZedSettings } from './settings-overlay.js';
import { ZED_TARGET, ZED_SETTINGS_FILE, ZED_GLOBAL_SETTINGS_FILE } from './constants.js';

/** True when mcp, ignore or permissions would put something in settings.json. */
function writesSettings(canonical: CanonicalFiles): boolean {
  if (Object.keys(canonical.mcp?.mcpServers ?? {}).length > 0) return true;
  if (canonical.ignore.length > 0) return true;
  return permissionEntries(canonical.permissions).length > 0;
}

/**
 * Zed reads `settings.json` as JSONC and ships a default file full of comments.
 * agentsmesh refuses to rewrite one (`JSON.stringify` would delete them), which
 * makes MCP, ignore and permissions a no-op — so say so instead of reporting a
 * clean generate. Rides on `lintRules` because it is the only lint hook that
 * receives `projectRoot`.
 */
function lintSettingsWritability(
  canonical: CanonicalFiles,
  projectRoot: string,
  scope: 'project' | 'global',
): LintDiagnostic[] {
  if (!writesSettings(canonical)) return [];
  const rel = scope === 'global' ? ZED_GLOBAL_SETTINGS_FILE : ZED_SETTINGS_FILE;
  const absolute = join(projectRoot, rel);
  if (!existsSync(absolute)) return [];
  if (parseZedSettings(readFileSync(absolute, 'utf8')) !== null) return [];
  return [
    createWarning(
      rel,
      ZED_TARGET,
      `${rel} is JSONC, not strict JSON. agentsmesh leaves it untouched rather than ` +
        `re-serializing it without the comments, so MCP servers, ignore globs and tool ` +
        `permissions are NOT written. Remove the comments from that file, or manage those ` +
        `keys by hand.`,
    ),
  ];
}

export function lintRules(
  canonical: CanonicalFiles,
  projectRoot: string,
  projectFiles: string[],
  options?: { scope?: 'project' | 'global' },
): LintDiagnostic[] {
  const scope = options?.scope === 'global' ? 'global' : 'project';
  return [
    ...validateRules(canonical, projectRoot, projectFiles, {
      checkGlobMatches: scope !== 'global',
    }).map((diagnostic) => ({ ...diagnostic, target: ZED_TARGET })),
    ...lintSettingsWritability(canonical, projectRoot, scope),
  ];
}
