/**
 * The single owned-key contract for Zed's `settings.json`.
 *
 * Three features write one file — mcp (`context_servers`), ignore
 * (`file_scan_exclusions` + `private_files`) and permissions (`agent`) — so a
 * whole-file replace would delete the user's editor settings, and a per-feature
 * write would let the last feature clobber the earlier ones.
 *
 * `owned` is the set of keys THIS run may rewrite. A key is claimed only when
 * its feature is enabled AND the canonical SOURCE for that feature exists, so a
 * plain `agentsmesh generate` in a repo with no `.agentsmesh/mcp.json` or
 * `permissions.yaml` never touches what the user configured by hand. `present`
 * holds the claimed keys that actually carry canonical content.
 *
 * How a claimed key is applied depends on what provenance it offers:
 *   - `context_servers` is an agentsmesh-managed inventory (`mcp.json` is the
 *     source of truth for every target), so it is rewritten and cleared.
 *   - the two ignore glob lists carry no marker saying who wrote an entry, so
 *     they are only ever added to — see `ignore-settings.ts`.
 *   - `agent` is merged per pattern — see `permissions-merge.ts`.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { CanonicalFiles } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import {
  ZED_FILE_SCAN_EXCLUSIONS_KEY,
  ZED_PRIVATE_FILES_KEY,
  buildZedIgnoreSettings,
  mergeZedIgnoreList,
} from './ignore-settings.js';
import { buildZedToolEntries } from './permissions-settings.js';
import { mergeZedAgent } from './permissions-merge.js';

const ZED_AGENT_KEY = 'agent';
const ZED_CONTEXT_SERVERS_KEY = 'context_servers';

export const ZED_OWNED_SETTINGS_KEYS = [
  ZED_CONTEXT_SERVERS_KEY,
  ZED_FILE_SCAN_EXCLUSIONS_KEY,
  ZED_PRIVATE_FILES_KEY,
  ZED_AGENT_KEY,
] as const;

/**
 * Owned keys whose absence from canonical means "remove it". The two ignore glob
 * lists are missing on purpose: they carry no marker saying who wrote an entry,
 * so they are only ever added to and an emptied canonical ignore revokes nothing.
 */
export const ZED_REVOCABLE_SETTINGS_KEYS: readonly string[] = [
  ZED_CONTEXT_SERVERS_KEY,
  ZED_AGENT_KEY,
];

export interface ZedOwnedOverlay {
  /** Keys this run may rewrite. */
  readonly owned: string[];
  /** Owned keys that carry canonical content. */
  readonly present: Record<string, unknown>;
}

function addMcp(canonical: CanonicalFiles, overlay: ZedOwnedOverlay): void {
  // `mcp === null` means there is no `.agentsmesh/mcp.json` at all: no opinion,
  // so the user's own `context_servers` stay. An empty file is an opinion.
  if (canonical.mcp === null) return;
  overlay.owned.push(ZED_CONTEXT_SERVERS_KEY);
  const servers = canonical.mcp.mcpServers;
  if (Object.keys(servers).length === 0) return;
  overlay.present[ZED_CONTEXT_SERVERS_KEY] = { ...servers };
}

function addIgnore(canonical: CanonicalFiles, overlay: ZedOwnedOverlay): void {
  overlay.owned.push(ZED_FILE_SCAN_EXCLUSIONS_KEY, ZED_PRIVATE_FILES_KEY);
  const settings = buildZedIgnoreSettings(canonical.ignore);
  if (settings.private_files.length === 0) return;
  overlay.present[ZED_FILE_SCAN_EXCLUSIONS_KEY] = settings.file_scan_exclusions;
  overlay.present[ZED_PRIVATE_FILES_KEY] = settings.private_files;
}

function addPermissions(canonical: CanonicalFiles, overlay: ZedOwnedOverlay): void {
  if (canonical.permissions === null) return;
  overlay.owned.push(ZED_AGENT_KEY);
  const tools = buildZedToolEntries(canonical.permissions);
  if (Object.keys(tools).length === 0) return;
  overlay.present[ZED_AGENT_KEY] = { tool_permissions: { tools } };
}

/**
 * @param scope - `agent.tool_permissions` exists only on user-level settings, so
 *   permissions are claimed in global scope alone.
 */
export function buildZedOwnedOverlay(
  canonical: CanonicalFiles,
  scope: TargetLayoutScope,
  enabledFeatures: ReadonlySet<string>,
): ZedOwnedOverlay {
  const overlay: ZedOwnedOverlay = { owned: [], present: {} };
  if (enabledFeatures.has('mcp')) addMcp(canonical, overlay);
  if (enabledFeatures.has('ignore')) addIgnore(canonical, overlay);
  if (enabledFeatures.has('permissions') && scope === 'global') addPermissions(canonical, overlay);
  return overlay;
}

/** Apply one owned key onto a parsed settings object, in place. */
export function applyZedOwnedSettingsKey(
  out: Record<string, unknown>,
  key: string,
  desired: unknown,
): void {
  if (key === ZED_AGENT_KEY) {
    const merged = mergeZedAgent(out[ZED_AGENT_KEY], desired ?? {});
    if (merged === undefined) delete out[ZED_AGENT_KEY];
    else out[ZED_AGENT_KEY] = merged;
    return;
  }
  if (key === ZED_FILE_SCAN_EXCLUSIONS_KEY || key === ZED_PRIVATE_FILES_KEY) {
    const merged = mergeZedIgnoreList(
      out[key],
      Array.isArray(desired) ? (desired as string[]) : [],
    );
    if (merged !== null) out[key] = merged;
    return;
  }
  if (desired !== undefined) out[key] = desired;
  else delete out[key];
}

/** Apply the overlay onto a parsed settings object; the input is not mutated. */
export function applyZedOwnedOverlay(
  base: Record<string, unknown>,
  overlay: ZedOwnedOverlay,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const key of overlay.owned) applyZedOwnedSettingsKey(out, key, overlay.present[key]);
  return out;
}

/**
 * Parse a settings file body, or `null` when it is not strict JSON.
 *
 * Zed reads `settings.json` as JSONC (`parse_json_with_comments`) and its own
 * default file is mostly comments, but re-serializing with `JSON.stringify`
 * would delete them. Callers therefore leave an unparseable file completely
 * alone rather than rewriting the user's whole editor config without them;
 * `lintRules` reports that so the skip is not silent.
 */
export function parseZedSettings(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
