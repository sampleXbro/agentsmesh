/**
 * Import legacy `.kilocodemodes` (Roo-era custom modes) into canonical agents.
 * Split out of importer.ts to keep that file under the 200-line limit.
 */

import { AB_AGENTS } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { serializeImportedAgentWithFallback } from '../import/import-metadata.js';
import { KILO_CODE_TARGET, KILO_CODE_LEGACY_MODES_FILE } from './constants.js';

type Normalizer = (content: string, sourceFile: string, destinationFile: string) => string;

interface LegacyMode {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  roleDefinition?: unknown;
  whenToUse?: unknown;
}

interface LegacyModesFile {
  customModes?: unknown;
}

/**
 * Import `.kilocodemodes` (YAML or JSON) custom modes into
 * `.agentsmesh/agents/<slug>.md`. Translates the legacy roo/kilo
 * `roleDefinition` body into the canonical agent body.
 */
export async function importLegacyModes(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalizer,
): Promise<void> {
  const sourceFile = join(projectRoot, KILO_CODE_LEGACY_MODES_FILE);
  const content = await readFileSafe(sourceFile);
  if (content === null) return;
  let parsed: LegacyModesFile;
  try {
    parsed = yamlParse(content) as LegacyModesFile;
  } catch {
    return;
  }
  if (!parsed || !Array.isArray(parsed.customModes)) return;
  for (const raw of parsed.customModes) {
    if (!raw || typeof raw !== 'object') continue;
    const mode = raw as LegacyMode;
    if (typeof mode.slug !== 'string' || mode.slug.length === 0) continue;
    const slug = mode.slug;
    const destPath = join(projectRoot, AB_AGENTS, `${slug}.md`);
    const description = typeof mode.description === 'string' ? mode.description : '';
    const role = typeof mode.roleDefinition === 'string' ? mode.roleDefinition.trim() : '';
    const whenToUse = typeof mode.whenToUse === 'string' ? mode.whenToUse.trim() : '';
    const body = whenToUse ? `${role}\n\n## When to use\n\n${whenToUse}` : role;
    // Only canonical agent fields are preserved by the shared serializer; the
    // kilo-specific `mode: subagent` frontmatter key is re-added by the
    // generator on round-trip.
    const frontmatter: Record<string, unknown> = {};
    if (description) frontmatter.description = description;
    if (typeof mode.name === 'string' && mode.name.length > 0) frontmatter.name = mode.name;
    const serialized = await serializeImportedAgentWithFallback(destPath, frontmatter, body);
    const normalized = normalize(serialized, sourceFile, destPath);
    await writeFileAtomic(destPath, normalized);
    results.push({
      feature: 'agents',
      fromTool: KILO_CODE_TARGET,
      fromPath: sourceFile,
      toPath: `${AB_AGENTS}/${slug}.md`,
    });
  }
}
