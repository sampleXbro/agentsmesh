/**
 * Materialize an install as a local pack (default install behavior).
 */

import { join } from 'node:path';
import { materializePack } from '../pack/pack-writer.js';
import { readPackMetadata } from '../pack/pack-reader.js';
import { mergeIntoPack } from '../pack/pack-merge.js';
import { cleanInstallCache } from '../pack/cache-cleanup.js';
import { collectPreservedRootFiles } from '../source/collect-preserved-root.js';
import { targetSchema } from '../../config/core/schema.js';
import { logger } from '../../utils/output/logger.js';
import { buildInstallManifestEntry, upsertInstallManifestEntry } from '../core/install-manifest.js';
import { applySelection, pathScope, type InstallAsPackArgs } from './install-pack-args.js';
import { packNameCollision, resolveInstallPack } from './install-pack-target.js';

export type { InstallAsPackArgs } from './install-pack-args.js';

/**
 * Install discovered resources as a local pack (default mode).
 * Detects existing pack by source to merge incrementally.
 * Cleans cache entry on success for remote sources.
 */
export async function installAsPack(args: InstallAsPackArgs): Promise<string> {
  const {
    canonicalDir,
    packName,
    narrowed,
    selected,
    sourceForYaml,
    version,
    sourceKind,
    entryFeatures,
    pick,
    yamlTarget,
    pathInRepo,
    manualAs,
    explicitName,
    dryRun,
    sourceType,
    contentRoot,
    forceFreshMaterialize,
    originalRef,
    acceptedElevated,
  } = args;

  const packsDir = join(canonicalDir, 'packs');
  const selectedCanonical = applySelection(narrowed, selected);
  const preservedRootFiles = contentRoot ? await collectPreservedRootFiles(contentRoot) : [];
  const now = new Date().toISOString();
  const parsedTarget = yamlTarget !== undefined ? targetSchema.parse(yamlTarget) : undefined;

  const packTarget = forceFreshMaterialize
    ? null
    : await resolveInstallPack({
        packsDir,
        source: sourceForYaml,
        packName,
        explicitName: explicitName === true,
        target: parsedTarget,
        as: manualAs,
        features: entryFeatures,
        pick,
        pathInRepo,
      });
  let persistedName: string;
  let persistedFeatures = entryFeatures;
  let persistedPick = pick;
  let persistedPath = pathInRepo;
  let persistedPaths: string[] | undefined;
  const packMeta = packTarget?.found.meta;
  if (!packMeta && !forceFreshMaterialize && (await readPackMetadata(join(packsDir, packName)))) {
    throw packNameCollision(packName, explicitName === true);
  }
  if (dryRun) return packMeta?.name ?? packName;
  if (packTarget && !packTarget.replace) {
    const mergedMeta = await mergeIntoPack(
      packTarget.found.packDir,
      packTarget.found.meta,
      selectedCanonical,
      entryFeatures as string[],
      pick,
      {
        source: sourceForYaml,
        ...(version !== undefined ? { version } : {}),
        ...(parsedTarget !== undefined ? { target: parsedTarget } : {}),
        ...(pathInRepo ? { path: pathInRepo } : {}),
        ...(manualAs !== undefined ? { as: manualAs } : {}),
      },
      preservedRootFiles,
    );
    persistedName = mergedMeta.name;
    persistedFeatures = mergedMeta.features;
    persistedPick = mergedMeta.pick;
    persistedPath = mergedMeta.path;
    persistedPaths = mergedMeta.paths;
    logger.success(`Updated pack "${mergedMeta.name}" in .agentsmesh/packs/.`);
  } else {
    // A whole-source re-install replaces the pack in place (like refresh).
    persistedName = packMeta?.name ?? packName;
    await materializePack(
      packsDir,
      persistedName,
      selectedCanonical,
      {
        name: persistedName,
        source: sourceForYaml,
        ...(version !== undefined && { version }),
        source_kind: sourceKind,
        installed_at: packMeta?.installed_at ?? now,
        updated_at: now,
        features: entryFeatures,
        ...(pick !== undefined && { pick }),
        ...(parsedTarget !== undefined && { target: parsedTarget }),
        ...pathScope(pathInRepo),
        ...(manualAs !== undefined && { as: manualAs }),
      },
      sourceType !== undefined ? { source_type: sourceType } : {},
      preservedRootFiles,
    );
    const verb = packMeta ? 'Updated pack' : 'Installed pack';
    logger.success(`${verb} "${persistedName}" ${packMeta ? 'in' : 'to'} .agentsmesh/packs/.`);
  }

  await upsertInstallManifestEntry(
    canonicalDir,
    buildInstallManifestEntry({
      name: persistedName,
      source: sourceForYaml,
      version,
      sourceKind,
      features: persistedFeatures,
      pick: persistedPick,
      target: parsedTarget,
      path: persistedPath,
      paths: persistedPaths,
      as: manualAs,
      originalRef,
      acceptedElevated,
    }),
  );

  if (sourceKind !== 'local') {
    await cleanInstallCache(sourceForYaml);
  }
  return persistedName;
}
