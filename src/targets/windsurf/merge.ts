/**
 * Two Windsurf files agentsmesh writes into that Windsurf writes too.
 *
 *   - `~/.codeium/windsurf/mcp_config.json` — the file Cascade's MCP UI writes
 *     (https://docs.windsurf.com/windsurf/cascade/mcp). agentsmesh replaced the
 *     whole document, so a server added in the UI and every other top-level key
 *     were lost on the next generate. The project sidecar
 *     `.windsurf/mcp_config.example.json` is NOT claimed: it is an agentsmesh
 *     reference artifact Windsurf never reads.
 *   - `.windsurf/hooks.json` / `~/.codeium/windsurf/hooks.json` — the workspace
 *     and user hooks files (docs.devin.ai/desktop/cascade/hooks), hand-authored
 *     or deployed by an enterprise fleet. Two DIFFERENT strings, so both are
 *     claimed.
 */

import { firstMerger, type GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import { ownedJsonKeysMerger } from '../../core/generate/json-owned-keys.js';
import {
  CANONICAL_MCP_SERVER_KEYS,
  mcpServersJsonMerger,
} from '../../core/generate/mcp-servers-merge.js';
import {
  WINDSURF_GLOBAL_HOOKS_FILE,
  WINDSURF_GLOBAL_MCP_FILE,
  WINDSURF_HOOKS_FILE,
} from './constants.js';

const mergeMcp = mcpServersJsonMerger([WINDSURF_GLOBAL_MCP_FILE], CANONICAL_MCP_SERVER_KEYS);
const mergeHooks = ownedJsonKeysMerger(
  [WINDSURF_HOOKS_FILE, WINDSURF_GLOBAL_HOOKS_FILE],
  ['hooks'],
);

export const mergeWindsurfOutput: GeneratedOutputMerger = firstMerger([mergeMcp, mergeHooks]);
