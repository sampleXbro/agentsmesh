/**
 * Incrementally merge new canonical resources into an existing pack.
 */

import { copyEntitiesInto } from './copy-entities.js';
import { join, dirname } from 'node:path';
import { copyFile } from 'node:fs/promises';
import { stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles } from '../../core/types.js';
import type { PackMetadata } from './pack-schema.js';
import type { ExtendPick } from '../../config/core/schema.js';
import { writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { prependYamlSchemaDirective } from '../../utils/output/schema-directive.js';
import { hashPackContent } from './pack-hash.js';
import { normalizePersistedInstallPaths } from '../core/portable-paths.js';
import type { PreservedRootFile } from '../source/collect-preserved-root.js';

export interface PackMetadataRefresh {
  source: string;
  version?: string;
  target?: PackMetadata['target'];
  path?: string;
  as?: PackMetadata['as'];
}

/** Union two string arrays, deduplicating. */
function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function mergePathScope(
  existing: Pick<PackMetadata, 'path' | 'paths'>,
  incomingPath?: string,
): Pick<PackMetadata, 'path' | 'paths'> {
  const existingIsRoot = existing.path === undefined && existing.paths === undefined;
  if (existingIsRoot || incomingPath === undefined) {
    return { path: undefined, paths: undefined };
  }

  const merged = union(existing.paths ?? (existing.path ? [existing.path] : []), [incomingPath]);
  if (merged.length === 1) {
    return { path: merged[0], paths: undefined };
  }
  return { path: undefined, paths: merged };
}

/** Merge picks: if newPick is undefined for a feature, remove the restriction (all). */
function mergePick(
  existing: ExtendPick | undefined,
  newFeatures: string[],
  newPick: ExtendPick | undefined,
): ExtendPick | undefined {
  const result: ExtendPick = { ...existing };

  for (const feature of newFeatures as (keyof ExtendPick)[]) {
    if (newPick && newPick[feature] !== undefined) {
      // Union specific lists
      result[feature] = union(result[feature] ?? [], newPick[feature]!);
    } else {
      // No pick = install all → remove restriction
      delete result[feature];
    }
  }

  // Return undefined if no restrictions remain
  const hasAny =
    (result.skills?.length ?? 0) > 0 ||
    (result.rules?.length ?? 0) > 0 ||
    (result.commands?.length ?? 0) > 0 ||
    (result.agents?.length ?? 0) > 0;
  return hasAny ? result : undefined;
}

/** Copy new skills into packDir/skills/. */
async function mergeSkills(canonical: CanonicalFiles, packDir: string): Promise<void> {
  if (canonical.skills.length === 0) return;
  const skillsDir = join(packDir, 'skills');
  await mkdirp(skillsDir);
  for (const skill of canonical.skills) {
    const destDir = join(skillsDir, skill.name);
    await mkdirp(destDir);
    await copyFile(skill.source, join(destDir, 'SKILL.md'));
    for (const sf of skill.supportingFiles) {
      const destPath = join(destDir, sf.relativePath);
      await mkdirp(dirname(destPath));
      await copyFile(sf.absolutePath, destPath);
    }
  }
}

/**
 * Refresh upstream preserved-boilerplate files (README/LICENSE/…) at the pack
 * root. Overwrites on collision: the latest upstream source is the truth on
 * re-install, matching how the rest of `mergeIntoPack` treats same-name files.
 */
async function mergePreservedRootFiles(
  files: readonly PreservedRootFile[],
  packDir: string,
): Promise<void> {
  for (const file of files) {
    await copyFile(file.absolutePath, join(packDir, file.relativePath));
  }
}

async function mergeSettings(canonical: CanonicalFiles, packDir: string): Promise<void> {
  if (canonical.mcp !== null) {
    await writeFileAtomic(join(packDir, 'mcp.json'), `${JSON.stringify(canonical.mcp, null, 2)}\n`);
  }
  if (canonical.permissions !== null) {
    await writeFileAtomic(join(packDir, 'permissions.yaml'), yamlStringify(canonical.permissions));
  }
  if (canonical.hooks !== null) {
    await writeFileAtomic(join(packDir, 'hooks.yaml'), yamlStringify(canonical.hooks));
  }
  if (canonical.ignore.length > 0) {
    await writeFileAtomic(join(packDir, 'ignore'), `${canonical.ignore.join('\n')}\n`);
  }
}

/**
 * Merge new canonical resources into an existing pack directory.
 * Adds new files alongside existing ones. Updates metadata.
 *
 * @param packDir - Absolute path to the existing pack directory
 * @param existingMeta - Current pack.yaml metadata
 * @param newCanonical - New canonical resources to add
 * @param newFeatures - Feature names being added
 * @param newPick - Optional pick for the new features (undefined = all)
 * @returns Updated PackMetadata
 */
export async function mergeIntoPack(
  packDir: string,
  existingMeta: PackMetadata,
  newCanonical: CanonicalFiles,
  newFeatures: string[],
  newPick: ExtendPick | undefined,
  refresh?: PackMetadataRefresh,
  preservedRootFiles: readonly PreservedRootFile[] = [],
): Promise<PackMetadata> {
  // Write new resources
  await copyEntitiesInto(packDir, 'rules', newCanonical.rules);
  await copyEntitiesInto(packDir, 'commands', newCanonical.commands);
  await copyEntitiesInto(packDir, 'agents', newCanonical.agents);
  await mergeSkills(newCanonical, packDir);
  await mergeSettings(newCanonical, packDir);
  await mergePreservedRootFiles(preservedRootFiles, packDir);

  // Merge metadata
  const mergedFeatures = union(existingMeta.features, newFeatures) as PackMetadata['features'];
  const mergedPick = mergePick(existingMeta.pick, newFeatures, newPick);
  const mergedPathScope = mergePathScope(existingMeta, refresh?.path);
  const contentHash = await hashPackContent(packDir);
  const updatedAt = new Date().toISOString();

  const updatedMeta: PackMetadata = normalizePersistedInstallPaths({
    ...existingMeta,
    source: refresh?.source ?? existingMeta.source,
    ...(refresh?.version !== undefined
      ? { version: refresh.version }
      : existingMeta.version !== undefined
        ? { version: existingMeta.version }
        : {}),
    features: mergedFeatures,
    pick: mergedPick,
    ...(refresh?.target !== undefined
      ? { target: refresh.target }
      : existingMeta.target !== undefined
        ? { target: existingMeta.target }
        : {}),
    ...mergedPathScope,
    ...(refresh?.as !== undefined
      ? { as: refresh.as }
      : existingMeta.as !== undefined
        ? { as: existingMeta.as }
        : {}),
    updated_at: updatedAt,
    content_hash: contentHash,
  });

  await writeFileAtomic(
    join(packDir, 'pack.yaml'),
    prependYamlSchemaDirective(yamlStringify(updatedMeta), 'pack'),
  );
  return updatedMeta;
}
