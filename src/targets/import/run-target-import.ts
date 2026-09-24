/**
 * Import one target without dropping canonical settings an earlier import wrote.
 *
 * Permissions, ignore patterns and MCP servers are lists of separate entries,
 * not one entity, so a second tool's import adds to them instead of replacing
 * them (#131): what the importer wrote stays, and entries only the earlier file
 * had are added back. Import never removes an entry here; edit the canonical
 * file for that. Every other canonical path keeps last-import-wins.
 *
 * Done once around `importFrom`, so every importer and every plugin gets it.
 */

import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { parsePermissionsContent } from '../../canonical/features/permissions.js';
import { AB_IGNORE, AB_MCP, AB_PERMISSIONS } from '../../core/canonical-paths.js';
import type { ImportResult } from '../../core/types.js';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import type { TargetDescriptor, TargetLayoutScope } from '../catalog/target-descriptor.js';
import { parseMcpServers } from './mcp-merge.js';

const PERMISSION_LISTS = ['allow', 'deny', 'ask'] as const;

type Keeper = (path: string, before: string) => Promise<void>;

async function keepPermissions(path: string, before: string): Promise<void> {
  const after = (await readFileSafe(path)) ?? '';
  const skipBroken = (): void => undefined;
  const earlier = parsePermissionsContent(before, path, skipBroken);
  const now = parsePermissionsContent(after, path, skipBroken);
  if (earlier === null || now === null) return;
  const doc = parseDocument(after);
  let changed = false;
  for (const list of PERMISSION_LISTS) {
    const old = earlier[list];
    const cur = now[list];
    if (old.every((entry) => cur.includes(entry))) continue;
    doc.set(list, [...old, ...cur.filter((entry) => !old.includes(entry))]);
    changed = true;
  }
  if (changed) await writeFileAtomic(path, doc.toString());
}

async function keepIgnorePatterns(path: string, before: string): Promise<void> {
  const lines = (text: string): string[] =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const earlier = lines(before);
  const now = lines((await readFileSafe(path)) ?? '');
  if (earlier.every((line) => now.includes(line))) return;
  const added = now.filter((line) => !earlier.includes(line));
  await writeFileAtomic(path, `${[before.trimEnd(), ...added].join('\n')}\n`);
}

/** Same rule as `writeMcpWithMerge`: the new import wins on a name clash. */
async function keepMcpServers(path: string, before: string): Promise<void> {
  const earlier = parseMcpServers(before);
  const now = parseMcpServers(await readFileSafe(path));
  if (Object.keys(earlier).every((name) => Object.hasOwn(now, name))) return;
  await writeFileAtomic(path, JSON.stringify({ mcpServers: { ...earlier, ...now } }, null, 2));
}

const KEEPERS: ReadonlyArray<readonly [string, Keeper]> = [
  [AB_PERMISSIONS, keepPermissions],
  [AB_IGNORE, keepIgnorePatterns],
  [AB_MCP, keepMcpServers],
];

/** Run the target's import, then add back settings entries it replaced. */
export async function runTargetImport(
  descriptor: Pick<TargetDescriptor, 'generators'>,
  rootBase: string,
  scope: TargetLayoutScope,
): Promise<ImportResult[]> {
  const snapshots = await Promise.all(
    KEEPERS.map(async ([rel, keep]) => {
      const path = join(rootBase, rel);
      return { path, keep, before: await readFileSafe(path) };
    }),
  );
  const results = await descriptor.generators.importFrom(rootBase, { scope });
  for (const { path, keep, before } of snapshots) {
    if (before !== null) await keep(path, before);
  }
  return results;
}
