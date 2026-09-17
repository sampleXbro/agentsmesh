/**
 * Two Cline files agentsmesh writes into that it does not own outright.
 *
 *   - `.cline/mcp.json` — Cline's own MCP settings file, the one its MCP server
 *     UI writes and `importClineMcp` reads (mcp-mapper.ts). Rewriting it from
 *     canonical dropped Cline's per-server `disabled`, `autoApprove`, `timeout`
 *     and `transportType`, so a disabled server re-enabled itself on every
 *     generate. Global scope needs nothing: `generateMcp` returns `[]` there.
 *   - `.cline/agents.yaml` — the combined agents manifest. Whether Cline writes
 *     it is unresolved in-repo (the capability ledger says the path is
 *     confirmed; docs/reviews/target-capabilities-drift-2026-07-12.md, same
 *     date, says it is wrong), so the safe reading wins: agentsmesh owns the
 *     `agents` key, every other top-level key survives, and the file is never
 *     deleted.
 */

import { firstMerger, type GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import { ownedYamlKeysMerger } from '../../core/generate/yaml-owned-keys.js';
import {
  CANONICAL_MCP_SERVER_KEYS,
  mcpServersJsonMerger,
} from '../../core/generate/mcp-servers-merge.js';
import { CLINE_AGENTS_FILE, CLINE_MCP_SETTINGS } from './constants.js';

const mergeMcp = mcpServersJsonMerger([CLINE_MCP_SETTINGS], CANONICAL_MCP_SERVER_KEYS);
const mergeAgents = ownedYamlKeysMerger([CLINE_AGENTS_FILE], ['agents']);

export const mergeClineOutput: GeneratedOutputMerger = firstMerger([mergeMcp, mergeAgents]);
