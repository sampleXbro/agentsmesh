/**
 * Three Cursor files agentsmesh writes into that Cursor writes too.
 *
 *   - `.cursor/mcp.json` (both scopes, one string) — what Settings -> MCP ->
 *     "Add new MCP server" writes, and what the importer reads at both scopes.
 *     agentsmesh owns the server set; Cursor's per-server `enabled`/`disabled`,
 *     `cwd`, `timeout` and `envFile` carry over.
 *   - `.cursor/hooks.json` (both scopes, one string) — hooks are hand-authored
 *     or installed from Customize plugins (cursor.com/docs/agent/hooks), so
 *     every top-level key outside `version`/`hooks` is the user's.
 *   - `.cursor/cli.json` / `.cursor/cli-config.json` — THE Agent CLI config
 *     (cursor.com/docs/cli/reference/configuration): `version`, `editor` and
 *     `network` live beside `permissions`, and the CLI persists interactive
 *     approve/deny and /sandbox choices back into it. These are two DIFFERENT
 *     strings, so both are claimed — claiming one would leave the twin on
 *     whole-file replacement.
 */

import { firstMerger, type GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import { ownedJsonKeysMerger } from '../../core/generate/json-owned-keys.js';
import {
  CANONICAL_MCP_SERVER_KEYS,
  mcpServersJsonMerger,
} from '../../core/generate/mcp-servers-merge.js';
import {
  CURSOR_CLI_JSON,
  CURSOR_GLOBAL_CLI_CONFIG,
  CURSOR_HOOKS,
  CURSOR_MCP,
} from './constants.js';

const mergeMcp = mcpServersJsonMerger([CURSOR_MCP], CANONICAL_MCP_SERVER_KEYS);
const mergeHooks = ownedJsonKeysMerger([CURSOR_HOOKS], ['version', 'hooks']);
const mergePermissions = ownedJsonKeysMerger(
  [CURSOR_CLI_JSON, CURSOR_GLOBAL_CLI_CONFIG],
  ['permissions'],
);

export const mergeCursorOutput: GeneratedOutputMerger = firstMerger([
  mergeMcp,
  mergeHooks,
  mergePermissions,
]);
