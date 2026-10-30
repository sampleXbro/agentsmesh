/**
 * Key-scoped JSON merge for shared config files.
 *
 * A target that writes into a file the user also owns replaces only the keys it
 * owns and keeps everything else byte-for-byte. The merge is key-scoped, never
 * file-scoped, so removing a server from canonical still revokes it: the owned
 * key is replaced wholesale, not deep-merged.
 */

import type { GeneratedOutputMerger } from '../../targets/catalog/target-descriptor.js';

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Guard for mergers that parse the user's file before rewriting it.
 *
 * A base we cannot parse as a JSON object is a file we do not understand:
 * `.vscode/settings.json`, `kilo.jsonc` and `.qwen/settings.json` are all
 * comment-legal, and coercing an unparsable base to `{}` before serialising
 * over it costs the user every key in the file.
 *
 * @returns The base verbatim when it must be preserved, or null to proceed with
 * a normal merge (a blank base is "nothing to preserve", so the caller writes
 * the generated file).
 */
export function preservedUnparsableBase(base: string): string | null {
  if (base.trim() === '') return null;
  return parseJsonObject(base) === null ? base : null;
}

/**
 * @returns Merged JSON; the base verbatim when it is present but not a JSON
 * object; or null when there is no base to merge into (so the caller writes the
 * generated file).
 *
 * A base we cannot parse is a file we do not understand — JSONC comments are
 * legal in `.vscode/mcp.json` and `.qwen/settings.json`. Returning null there
 * would fall through to the default policy, which replaces the whole file and
 * destroys the user's keys. Preserving it is the same rule
 * `src/targets/zed/layout.ts` documents: never rewrite a file whose comments we
 * would drop.
 */
export function mergeOwnedJsonKeys(
  base: string | null,
  newContent: string,
  ownedKeys: readonly string[],
): string | null {
  if (base === null || base.trim() === '') return null;
  const incoming = parseJsonObject(newContent);
  if (incoming === null) return null;
  const baseObject = parseJsonObject(base);
  if (baseObject === null) return base;
  const merged: Record<string, unknown> = { ...baseObject };
  for (const key of ownedKeys) {
    if (key in incoming) merged[key] = incoming[key];
  }
  return JSON.stringify(merged, null, 2);
}

/**
 * Builds a `mergeGeneratedOutputContent` hook that owns `ownedKeys` at any of
 * `paths`. Targets sharing a path (`.mcp.json` is written by both claude-code
 * and deepagents-cli) MUST use the same owned-key set, or their output differs
 * and `resolveOutputCollisions` hard-fails the run.
 */
export function ownedJsonKeysMerger(
  paths: readonly string[],
  ownedKeys: readonly string[],
): (
  existing: string | null,
  pending: { readonly content: string } | undefined,
  newContent: string,
  resolvedPath: string,
) => string | null {
  return (existing, pending, newContent, resolvedPath) =>
    paths.includes(resolvedPath)
      ? mergeOwnedJsonKeys(pending?.content ?? existing, newContent, ownedKeys)
      : null;
}

/**
 * Same contract one level down: agentsmesh owns `ownedSubKeys` INSIDE
 * `container`, and nothing else in the document.
 *
 * `~/.junie/allowlist.json` is the case that needs it. Junie stores every
 * approval the user accepts with "Always allow" there, split into categories
 * (`fileEditing`, `executables`, `mcpTools`, `readOutsideProject`,
 * `readSecretFile`), and agentsmesh maps canonical permissions into exactly one
 * of them. Owning the whole `rules` key would still erase the other four, so the
 * merge has to reach inside it.
 *
 * Revocation still works: `container[subKey]` is replaced wholesale, and a
 * sub-key the generated content no longer carries is dropped from the base.
 */
export function mergeOwnedJsonSubKeys(
  base: string | null,
  newContent: string,
  container: string,
  ownedSubKeys: readonly string[],
): string | null {
  if (base === null || base.trim() === '') return null;
  const incoming = parseJsonObject(newContent);
  if (incoming === null) return null;
  const baseObject = parseJsonObject(base);
  if (baseObject === null) return base;

  const baseContainer = asObject(baseObject[container]);
  const incomingContainer = asObject(incoming[container]);
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(baseContainer)) {
    if (!ownedSubKeys.includes(key)) merged[key] = value;
  }
  for (const key of ownedSubKeys) {
    if (key in incomingContainer) merged[key] = incomingContainer[key];
  }
  return JSON.stringify({ ...baseObject, [container]: merged }, null, 2);
}

/** Builds a `mergeGeneratedOutputContent` hook owning `container.ownedSubKeys`. */
export function ownedJsonSubKeysMerger(
  paths: readonly string[],
  container: string,
  ownedSubKeys: readonly string[],
): GeneratedOutputMerger {
  return (existing, pending, newContent, resolvedPath) =>
    paths.includes(resolvedPath)
      ? mergeOwnedJsonSubKeys(pending?.content ?? existing, newContent, container, ownedSubKeys)
      : null;
}

/**
 * Spread merge inside `container`: the generated sub-keys replace the user's,
 * and every sub-key the generated content leaves out keeps the user's value. A
 * permission list that permissions.yaml does not manage is left out, so the
 * user's list survives; a managed list is revoked by writing it empty.
 */
export function mergeJsonContainer(
  base: string | null,
  newContent: string,
  container: string,
): string | null {
  if (base === null || base.trim() === '') return null;
  const incoming = parseJsonObject(newContent);
  if (incoming === null) return null;
  const baseObject = parseJsonObject(base);
  if (baseObject === null) return base;
  const merged = { ...asObject(baseObject[container]), ...asObject(incoming[container]) };
  return JSON.stringify({ ...baseObject, [container]: merged }, null, 2);
}

/** Builds a `mergeGeneratedOutputContent` hook spreading `container` at `paths`. */
export function jsonContainerMerger(
  paths: readonly string[],
  container: string,
): GeneratedOutputMerger {
  return (existing, pending, newContent, resolvedPath) =>
    paths.includes(resolvedPath)
      ? mergeJsonContainer(pending?.content ?? existing, newContent, container)
      : null;
}
