/**
 * Three Factory Droid files agentsmesh writes into that Droid writes too. All
 * three use one string for both scopes, so one path entry covers each twin.
 *
 *   - `.factory/settings.json` — "If the file doesn't exist, it's created with
 *     defaults the first time you run droid"
 *     (https://docs.factory.ai/cli/configuration/settings), and it holds ~20
 *     other top-level keys (model, reasoningEffort, customModels, enterprise
 *     blocks). agentsmesh owns `commandAllowlist` and `commandDenylist` only.
 *   - `.factory/hooks.json` — the `/hooks` manager saves here
 *     (docs.factory.ai/reference/hooks-reference); agentsmesh owns the `hooks`
 *     wrapper key.
 *   - `.factory/mcp.json` — written by `droid mcp add`; agentsmesh owns the
 *     server set only.
 */

import { firstMerger, type GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import { ownedJsonKeysMerger } from '../../core/generate/json-owned-keys.js';
import {
  CANONICAL_MCP_SERVER_KEYS,
  mcpServersJsonMerger,
} from '../../core/generate/mcp-servers-merge.js';
import {
  FACTORY_DROID_GLOBAL_HOOKS_FILE,
  FACTORY_DROID_GLOBAL_MCP_FILE,
  FACTORY_DROID_GLOBAL_SETTINGS_FILE,
  FACTORY_DROID_HOOKS_FILE,
  FACTORY_DROID_MCP_FILE,
  FACTORY_DROID_SETTINGS_FILE,
} from './constants.js';

const mergeMcp = mcpServersJsonMerger(
  [FACTORY_DROID_MCP_FILE, FACTORY_DROID_GLOBAL_MCP_FILE],
  CANONICAL_MCP_SERVER_KEYS,
);
const mergeHooks = ownedJsonKeysMerger(
  [FACTORY_DROID_HOOKS_FILE, FACTORY_DROID_GLOBAL_HOOKS_FILE],
  ['hooks'],
);
const mergeSettings = ownedJsonKeysMerger(
  [FACTORY_DROID_SETTINGS_FILE, FACTORY_DROID_GLOBAL_SETTINGS_FILE],
  ['commandAllowlist', 'commandDenylist'],
);

export const mergeFactoryDroidOutput: GeneratedOutputMerger = firstMerger([
  mergeMcp,
  mergeHooks,
  mergeSettings,
]);
