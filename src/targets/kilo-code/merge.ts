/**
 * Merge helper for `kilo.jsonc` / `.config/kilo/kilo.jsonc`.
 *
 * When a project already has a kilo.jsonc (e.g. with custom keys), agentsmesh
 * overlays only the keys it manages (`permission`, plus `instructions` and
 * `mcp` at global scope — see global-settings.ts) rather than overwriting the
 * whole file. Multiple generator passes write to the SAME path at global
 * scope (permissions via generatePermissionsFeature, instructions/mcp via
 * emitScopedSettings), so `base` always prefers `pending?.content` over
 * `existing` — each subsequent write builds on the previous one in this run.
 */

import type { GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import { preservedUnparsableBase } from '../../core/generate/json-owned-keys.js';
import {
  CANONICAL_MCP_SERVER_KEYS,
  mcpServersJsonMerger,
} from '../../core/generate/mcp-servers-merge.js';
import { KILO_CODE_MCP_FILE, KILO_CONFIG_FILE, KILO_GLOBAL_CONFIG_FILE } from './constants.js';

export const mergeKiloConfig: GeneratedOutputMerger = (
  existing,
  pending,
  newContent,
  resolvedPath,
) => {
  if (resolvedPath !== KILO_CONFIG_FILE && resolvedPath !== KILO_GLOBAL_CONFIG_FILE) return null;
  const base = pending?.content ?? existing;
  if (base === null) return newContent;
  // `jsonc` is the file's own format: comments are legal and expected.
  const preserved = preservedUnparsableBase(base);
  if (preserved !== null) return preserved;
  const parsed = JSON.parse(base) as Record<string, unknown>;
  const incoming: unknown = JSON.parse(newContent);
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) return base;
  const overlay = incoming as Record<string, unknown>;
  if (overlay.permission !== undefined) parsed.permission = overlay.permission;
  if (overlay.instructions !== undefined) parsed.instructions = overlay.instructions;
  if (overlay.mcp !== undefined) {
    // Preserve tool-managed server options such as enabled/timeout while replacing
    // the server set with canonical definitions.
    const previous = parsed.mcp && typeof parsed.mcp === 'object' &&
      !Array.isArray(parsed.mcp) ? parsed.mcp as Record<string, unknown> : {};
    const next = overlay.mcp as Record<string, unknown>;
    parsed.mcp = Object.fromEntries(Object.entries(next).map(([name, value]) => {
      const older = previous[name];
      const attributes = older && typeof older === 'object' && !Array.isArray(older)
        ? older as Record<string, unknown> : {};
      return [name, { ...attributes, ...(value as Record<string, unknown>) }];
    }));
  }
  return JSON.stringify(parsed, null, 2);
};

/**
 * `.kilo/mcp.json` is Kilo's own project MCP store. Kilo is a Roo Code fork, so
 * the extension writes `alwaysAllow`, `disabled` and `timeout` back into the
 * file whenever the user toggles a server; the importer also reads the legacy
 * `.kilocode/mcp.json` it never generates, which only makes sense if the tool
 * writes MCP files in its own directories.
 *
 * Global scope needs no claim: MCP folds into the already co-owned, already
 * merged `kilo.jsonc` there (layout.ts).
 */
export const mergeKiloMcpJson: GeneratedOutputMerger = mcpServersJsonMerger(
  [KILO_CODE_MCP_FILE],
  CANONICAL_MCP_SERVER_KEYS,
);
