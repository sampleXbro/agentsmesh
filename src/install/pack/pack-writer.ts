/** Materialize canonical files, then atomically swap the staged pack into place. */

import {
  copyEntitiesInto,
  copyPreservedRootFilesInto,
  copySkillsInto,
  writeSettingsInto,
} from './copy-entities.js';
import { join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles } from '../../core/types.js';
import type { PackMetadata } from './pack-schema.js';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';
import {
  prependYamlSchemaDirective,
  stampJsonSchemaField,
} from '../../utils/output/schema-directive.js';
import { hashPackContent } from './pack-hash.js';
import { hashPackFiles, INSTALL_MANIFEST_FILENAME } from '../manifest/install-manifest-hash.js';
import { normalizePersistedInstallPaths } from '../core/portable-paths.js';
import type { PreservedRootFile } from '../source/collect-preserved-root.js';
import { detectLicenseInPackDir } from '../license/detect-pack-license.js';
import { swapPackDirectory } from './pack-directory-swap.js';

type PackMetadataInput = Omit<PackMetadata, 'content_hash' | 'license'>;

export interface InstallManifestExtras {
  /** `null` for materialized installs; the extend entry id when extending. */
  readonly extends_id?: string | null;
  /** Classifier verdict that drove this install (e.g. `anthropic-skill-pack`). */
  readonly source_type?: string | null;
}

function validatePackName(name: string): void {
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name === '..' ||
    name === '.' ||
    name.includes('\0')
  ) {
    throw new Error(
      `Invalid pack name "${name}". Pack names must be a single directory segment without path separators.`,
    );
  }
}

async function writeInstallManifest(
  stagingDir: string,
  metadata: PackMetadata,
  extras: InstallManifestExtras,
): Promise<void> {
  const files = await hashPackFiles(stagingDir);
  const manifest = stampJsonSchemaField(
    {
      name: metadata.name,
      source: metadata.source,
      installed_at: metadata.installed_at,
      extends_id: extras.extends_id ?? null,
      source_type: extras.source_type ?? null,
      files,
    },
    'install-manifest',
  );
  await writeFileAtomic(
    join(stagingDir, INSTALL_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/**
 * Materialize canonical resources into a pack directory under packsDir.
 *
 * @param packsDir - Absolute path to `.agentsmesh/packs/`
 * @param packName - Directory name for this pack
 * @param canonical - Canonical files to write (already filtered + picked)
 * @param metadataInput - Pack metadata without `content_hash` (computed after write)
 * @param installManifestExtras - Optional extras for `.agentsmesh-install-manifest.json`
 * @returns Full PackMetadata including `content_hash`
 */
export async function materializePack(
  packsDir: string,
  packName: string,
  canonical: CanonicalFiles,
  metadataInput: PackMetadataInput,
  installManifestExtras: InstallManifestExtras = {},
  preservedRootFiles: readonly PreservedRootFile[] = [],
): Promise<PackMetadata> {
  validatePackName(packName);
  return swapPackDirectory(packsDir, packName, async (tmpDir) => {
    await copyEntitiesInto(tmpDir, 'rules', canonical.rules);
    await copyEntitiesInto(tmpDir, 'commands', canonical.commands);
    await copyEntitiesInto(tmpDir, 'agents', canonical.agents);
    await copySkillsInto(canonical, tmpDir);
    await writeSettingsInto(canonical, tmpDir);
    // Preserved root files (README/LICENSE/…) before hash so the bytes
    // participate in `content_hash` and the per-file install manifest.
    await copyPreservedRootFilesInto(preservedRootFiles, tmpDir);

    // Compute aggregate content hash (excludes pack.yaml + install manifest).
    const contentHash = await hashPackContent(tmpDir);

    // Detect the SPDX license now that preserved files have been written.
    // Runs against the staged bytes so it captures whatever the user is about
    // to install — without re-reading the upstream cache.
    const license = await detectLicenseInPackDir(tmpDir);

    const metadata = normalizePersistedInstallPaths({
      ...metadataInput,
      content_hash: contentHash,
      license,
    });
    await writeFileAtomic(
      join(tmpDir, 'pack.yaml'),
      prependYamlSchemaDirective(yamlStringify(metadata), 'pack'),
    );

    await writeInstallManifest(tmpDir, metadata, installManifestExtras);

    return metadata;
  });
}
