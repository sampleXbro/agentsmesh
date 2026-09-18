/**
 * Two Trae files agentsmesh writes into that Trae writes too.
 *
 *   - `.trae/mcp.json` (both scopes, one string) — the file Trae's MCP panel
 *     writes (https://docs.trae.ai/ide/model-context-protocol), the same
 *     UI-writes-the-file pattern constants.ts already records for rules.
 *   - `.trae/hooks.json` / `.trae-cn/hooks.json` — the documented project and
 *     global hook configs (docs.trae.cn/ide_hook-configuration-reference),
 *     keyed by `version` + `hooks`. Two DIFFERENT strings, so both are claimed.
 */

import { firstMerger, type GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import { ownedJsonKeysMerger } from '../../core/generate/json-owned-keys.js';
import {
  CANONICAL_MCP_SERVER_KEYS,
  mcpServersJsonMerger,
} from '../../core/generate/mcp-servers-merge.js';
import {
  TRAE_GLOBAL_HOOKS_FILE,
  TRAE_GLOBAL_MCP_FILE,
  TRAE_HOOKS_FILE,
  TRAE_MCP_FILE,
} from './constants.js';

const mergeMcp = mcpServersJsonMerger(
  [TRAE_MCP_FILE, TRAE_GLOBAL_MCP_FILE],
  CANONICAL_MCP_SERVER_KEYS,
);
const mergeHooks = ownedJsonKeysMerger(
  [TRAE_HOOKS_FILE, TRAE_GLOBAL_HOOKS_FILE],
  ['version', 'hooks'],
);

export const mergeTraeOutput: GeneratedOutputMerger = firstMerger([mergeMcp, mergeHooks]);
