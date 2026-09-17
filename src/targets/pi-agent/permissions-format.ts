/**
 * Canonical permissions <-> Pi `defaultTools`.
 *
 * pi.dev/docs/latest/settings: "defaultTools selects the built-in tools enabled
 * at startup", the built-ins being `read`, `bash`, `powershell`, `edit`,
 * `write`, `grep`, `find` and `ls`. That is the whole surface — Pi's own README
 * says it "does not include a built-in permission system for restricting
 * filesystem, process, network, or credential access".
 *
 * So the mapping is deliberately narrow: an allow-list over eight tool names.
 * Only a BARE canonical tool name maps. `Bash(npm run test:*)` does not become
 * `bash`, because that would turn a scoped grant into every command; the entry
 * is dropped and named by lint instead. Canonical `deny` and `ask` have no
 * representation at all.
 *
 * Ownership inside the array is per element: agentsmesh rewrites the seven
 * built-ins that have a canonical name and preserves anything else it finds
 * (today only `powershell`), so a user's own entry survives a regenerate.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { Permissions } from '../../core/types.js';

/** Startup order used for the emitted array; keeps output stable across runs. */
export const PI_BUILTIN_TOOLS = [
  'read',
  'bash',
  'powershell',
  'edit',
  'write',
  'grep',
  'find',
  'ls',
] as const;

const PI_TOOL_BY_CANONICAL: ReadonlyMap<string, string> = new Map([
  ['Read', 'read'],
  ['Bash', 'bash'],
  ['Edit', 'edit'],
  ['Write', 'write'],
  ['Grep', 'grep'],
  ['Glob', 'find'],
  ['LS', 'ls'],
]);

const CANONICAL_BY_PI_TOOL: ReadonlyMap<string, string> = new Map(
  [...PI_TOOL_BY_CANONICAL].map(([canonicalName, piTool]) => [piTool, canonicalName]),
);

/** Built-ins agentsmesh rewrites; every other entry in `defaultTools` is the user's. */
export const OWNED_PI_TOOLS: ReadonlySet<string> = new Set(CANONICAL_BY_PI_TOOL.keys());

/** The Pi built-in a canonical entry enables, or `null` when there is none. */
export function piToolFor(entry: string): string | null {
  return PI_TOOL_BY_CANONICAL.get(entry.trim()) ?? null;
}

/**
 * Whether canonical says anything at all. An existing but empty permissions
 * file is treated exactly like a missing one: it is not a claim that no tool is
 * approved, so it must not project onto `defaultTools: []`.
 */
export function hasPermissionEntries(permissions: Permissions | null): boolean {
  if (!permissions) return false;
  return (
    permissions.allow.length > 0 ||
    permissions.deny.length > 0 ||
    (permissions.ask ?? []).length > 0
  );
}

/** The `defaultTools` array canonical `allow` grants, in built-in order. */
export function buildDefaultTools(permissions: Permissions | null): string[] {
  if (!permissions) return [];
  const granted = new Set(
    permissions.allow
      .map((entry) => piToolFor(entry))
      .filter((tool): tool is string => tool !== null),
  );
  return PI_BUILTIN_TOOLS.filter((tool) => granted.has(tool));
}

export interface UnmappedPiEntries {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly ask: readonly string[];
}

/**
 * Everything the projection drops, grouped by list: allow entries with no Pi
 * built-in, and every deny and ask entry — Pi has neither tier.
 */
export function unmappedPermissionEntries(permissions: Permissions | null): UnmappedPiEntries {
  if (!permissions) return { allow: [], deny: [], ask: [] };
  return {
    allow: permissions.allow.filter((entry) => piToolFor(entry) === null),
    deny: [...permissions.deny],
    ask: [...(permissions.ask ?? [])],
  };
}

/** Pi built-ins back to canonical tool names; unknown built-ins have none. */
export function defaultToolsToCanonicalAllow(tools: readonly string[]): string[] {
  const out: string[] = [];
  for (const tool of tools) {
    const name = CANONICAL_BY_PI_TOOL.get(tool);
    if (name !== undefined && !out.includes(name)) out.push(name);
  }
  return out;
}

function parseObject(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** `defaultTools` from a settings file, or `null` when the key is absent/not a list. */
export function parseDefaultTools(content: string): string[] | null {
  const parsed = parseObject(content);
  if (parsed === null || !Array.isArray(parsed.defaultTools)) return null;
  return stringList(parsed.defaultTools);
}

/**
 * Overlay `defaultTools` onto `base`, which is the pending write from an earlier
 * pass of this run when there is one and the on-disk file otherwise.
 *
 * settings.json holds around 48 unrelated keys, so the merge is key-scoped and
 * never rewrites the file wholesale. An unparsable file is returned untouched:
 * one syntax error must not cost the user every other setting.
 *
 * The overlay carries two different instructions:
 *
 *  - a `defaultTools` ARRAY (even an empty one) means "canonical projects to
 *    exactly these": the key is always written. `defaultTools: []` is the
 *    faithful projection of "canonical pre-approves no Pi built-in", and it is
 *    the only safe one — DELETING the key hands every built-in back, including
 *    `bash` and `write`, which silently widens whatever the user had. `lint`
 *    names every built-in the projection switches off;
 *  - no `defaultTools` key means "agentsmesh no longer manages this": its own
 *    entries are stripped and the key is removed once nothing is left, which
 *    restores Pi's default rather than asserting an empty allow-list.
 *
 * Either way the built-ins agentsmesh does not own (today `powershell`) are
 * preserved, and re-merging content that already went through this function is
 * a no-op.
 */
export function mergePiSettings(base: string | null, newContent: string): string {
  const incoming = parseObject(newContent);
  const owned = Array.isArray(incoming?.defaultTools) ? stringList(incoming.defaultTools) : null;
  if (base === null) return withDefaultTools({}, owned ?? [], owned !== null);

  const settings = parseObject(base);
  if (settings === null) return base;
  const preserved = stringList(settings.defaultTools).filter(
    (tool) => !OWNED_PI_TOOLS.has(tool) && !(owned ?? []).includes(tool),
  );
  return withDefaultTools(settings, [...(owned ?? []), ...preserved], owned !== null);
}

function withDefaultTools(
  settings: Record<string, unknown>,
  tools: readonly string[],
  keepEmptyKey: boolean,
): string {
  if (tools.length > 0 || keepEmptyKey) settings.defaultTools = [...tools];
  else delete settings.defaultTools;
  return JSON.stringify(settings, null, 2) + '\n';
}

/**
 * Fold an imported `defaultTools` array into the canonical allow list.
 * Entries Pi cannot express (`Bash(npm test:*)`, `WebFetch`) survive; a bare
 * tool name Pi no longer enables is dropped, so a revoked grant leaves canonical.
 */
export function mergeImportedAllow(
  existing: readonly string[],
  tools: readonly string[],
): string[] {
  const out = defaultToolsToCanonicalAllow(tools);
  for (const entry of existing) {
    if (piToolFor(entry) === null && !out.includes(entry)) out.push(entry);
  }
  return out;
}
