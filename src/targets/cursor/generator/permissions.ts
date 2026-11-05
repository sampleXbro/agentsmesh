import type { CanonicalFiles } from '../../../core/types.js';
import { managedLists } from '../../../core/permissions.js';
import type { GenerateFeatureContext } from '../../catalog/target.interface.js';
import { CURSOR_CLI_JSON, CURSOR_GLOBAL_CLI_CONFIG } from '../constants.js';
import type { RulesOutput } from './types.js';

/**
 * Generate `.cursor/cli.json` (project) or `.cursor/cli-config.json` (global)
 * from canonical permissions.
 *
 * Cursor's CLI permissions format uses `{ permissions: { allow, deny } }`.
 * The `ask` category has no Cursor equivalent — items in `ask` are omitted
 * (Cursor's default behavior for unlisted tools is to prompt).
 *
 * A list permissions.yaml does not manage is left out, and the merge keeps the
 * user's own list (see `mergeCursorOutput`).
 *
 * Global scope uses a distinct filename: `~/.cursor/cli-config.json`.
 * Per https://cursor.com/docs/cli/reference/permissions the two paths are
 * `<project>/.cursor/cli.json` (project) and `~/.cursor/cli-config.json` (global).
 */
export function generatePermissions(
  canonical: CanonicalFiles,
  ctx?: GenerateFeatureContext,
): RulesOutput[] {
  const permissions = managedLists(canonical.permissions, ['allow', 'deny']);
  if (Object.keys(permissions).length === 0) return [];
  const path = ctx?.scope === 'global' ? CURSOR_GLOBAL_CLI_CONFIG : CURSOR_CLI_JSON;
  return [{ path, content: JSON.stringify({ permissions }, null, 2) }];
}
