/**
 * Zed-specific lint hooks.
 *
 * Each one names exactly what Zed drops:
 *   - permissions at PROJECT scope: everything. `SettingsStore::set_local_settings`
 *     parses `.zed/settings.json` as `ProjectSettingsContent`, which has no `agent`
 *     field, so anything written there is discarded.
 *   - permissions at GLOBAL scope: the entries with no tool in Zed's permission
 *     table (`docs/src/ai/tool-permissions.md` lists no read tool).
 *   - ignore: gitignore re-inclusions, which the glob lists cannot express.
 *   - commands: the `disable-model-invocation` flag on the projected skills.
 */

import { AB_IGNORE, AB_PERMISSIONS } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { unmappedPermissionEntries } from './permissions-settings.js';
import { unrepresentableIgnoreLines } from './ignore-settings.js';
import {
  ZED_TARGET,
  ZED_SETTINGS_FILE,
  ZED_GLOBAL_SETTINGS_FILE,
  ZED_SKILLS_DIR,
} from './constants.js';

interface ScopedLintOptions {
  readonly scope?: 'project' | 'global';
}

function scopeOf(options?: unknown): 'project' | 'global' {
  const scope = (options as ScopedLintOptions | undefined)?.scope;
  return scope === 'global' ? 'global' : 'project';
}

export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  const permissions = canonical.permissions;
  if (!permissions) return [];
  const total = permissions.allow.length + permissions.deny.length + (permissions.ask?.length ?? 0);
  if (total === 0) return [];

  if (scopeOf(options) === 'project') {
    return [
      createWarning(
        AB_PERMISSIONS,
        ZED_TARGET,
        `Zed reads agent.tool_permissions only from user settings; ${ZED_SETTINGS_FILE} is parsed ` +
          `as ProjectSettingsContent, which has no agent field. All ${total} permission entr(ies) ` +
          `are dropped at project scope. Run \`agentsmesh generate --global\` to write them to ` +
          `${ZED_GLOBAL_SETTINGS_FILE}.`,
      ),
    ];
  }

  const unmapped = unmappedPermissionEntries(permissions);
  if (unmapped.length === 0) return [];
  return [
    createWarning(
      AB_PERMISSIONS,
      ZED_TARGET,
      `Zed's tool-permission table has no tool for ${unmapped.join(', ')}, so ` +
        `${unmapped.length} entr(ies) are dropped. Zed matches terminal, edit_file, write_file, ` +
        `fetch and search_web only — it exposes no read tool.`,
    ),
  ];
}

export function lintIgnore(canonical: CanonicalFiles): LintDiagnostic[] {
  if (canonical.ignore.length === 0) return [];
  const negated = unrepresentableIgnoreLines(canonical.ignore);
  if (negated.length === 0) return [];
  return [
    createWarning(
      AB_IGNORE,
      ZED_TARGET,
      `Zed's file_scan_exclusions and private_files are plain glob lists with no negation, so ` +
        `re-inclusion pattern(s) ${negated.join(', ')} are dropped and the surrounding exclusion ` +
        `stays in force.`,
    ),
  ];
}

export function lintCommands(canonical: CanonicalFiles, _options?: unknown): LintDiagnostic[] {
  if (canonical.commands.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/commands',
      ZED_TARGET,
      `Zed has no command file format; ${canonical.commands.length} command(s) are projected as ` +
        `skills under ${ZED_SKILLS_DIR}/am-command-<name>/ while the commands_to_skills ` +
        `conversion is on (the default) — set conversions.commands_to_skills.zed to false and ` +
        `they are dropped instead. The projection omits \`disable-model-invocation: true\`, so ` +
        `Zed can still invoke them on its own instead of only on \`/am-command-<name>\`. The ` +
        `flag is left out on purpose: these files are shared byte for byte with codex-cli, ` +
        `which owns .agents/skills/ and does not write it.`,
    ),
  ];
}
