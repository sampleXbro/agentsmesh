/** Materialize canonical files, then atomically swap the staged pack into place. */

import { copyEntitiesInto } from './copy-entities.js';
import { join, dirname } from 'node:path';
import { copyFile } from 'node:fs/promises';
import { stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles } from '../../core/types.js';
import type { PackMetadata } from './pack-schema.js';
import { writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
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

/** Write skills to packDir/skills/{name}/ with SKILL.md and supporting files. */
async function writeSkills(canonical: CanonicalFiles, packDir: string): Promise<void> {
  if (canonical.skills.length === 0) return;
  const skillsDir = join(packDir, 'skills');
  await mkdirp(skillsDir);
  for (const skill of canonical.skills) {
    const skillDestDir = join(skillsDir, skill.name);
    await mkdirp(skillDestDir);
    // Copy SKILL.md
    await copyFile(skill.source, join(skillDestDir, 'SKILL.md'));
    // Copy supporting files
    for (const sf of skill.supportingFiles) {
      const destPath = join(skillDestDir, sf.relativePath);
      await mkdirp(dirname(destPath));
      await copyFile(sf.absolutePath, destPath);
    }
  }
}

/**
 * Copy upstream preserved-boilerplate files (README/LICENSE/NOTICE/…) into the
 * pack root verbatim. These files are not canonical entities — they carry
 * legal attribution and consumer-facing context for the redistributed pack.
 * Must run before `hashPackContent` so the bytes contribute to the pack hash.
 */
async function writePreservedRootFiles(
  files: readonly PreservedRootFile[],
  packDir: string,
): Promise<void> {
  for (const file of files) {
    await copyFile(file.absolutePath, join(packDir, file.relativePath));
  }
}

async function writeSettings(canonical: CanonicalFiles, packDir: string): Promise<void> {
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
    await writeSkills(canonical, tmpDir);
    await writeSettings(canonical, tmpDir);
    // Preserved root files (README/LICENSE/…) before hash so the bytes
    // participate in `content_hash` and the per-file install manifest.
    await writePreservedRootFiles(preservedRootFiles, tmpDir);

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
