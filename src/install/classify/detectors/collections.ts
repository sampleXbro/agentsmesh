/**
 * Detect `skills/<name>/SKILL.md` skill-pack roots, flat `rules/commands/agents/skills`
 * collections, and tool-native plugin manifests.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isBoilerplate } from '../../importers/boilerplate-filter.js';
import { dirExists, listDirEntries, classifyFileShape } from './fs-helpers.js';
import type {
  FlatCollection,
  FileShape,
  SkillPackRoot,
  ToolNativeManifest,
} from '../layout-types.js';

const FLAT_COLLECTION_DIRS: Record<string, FlatCollection['suggestedAs']> = {
  rules: 'rules',
  commands: 'commands',
  agents: 'agents',
  skills: 'skills',
};

const PLUGIN_MANIFESTS = ['.claude-plugin', '.codex-plugin', '.cursor-plugin'];

export async function detectSkillPack(root: string): Promise<SkillPackRoot | null> {
  const skillsDir = join(root, 'skills');
  const entries = await listDirEntries(skillsDir);
  for (const ent of entries) {
    // Any folder name counts (not only kebab-case): a stricter test made a
    // source with rules/ look like a lone rules collection and drop its skills.
    if (!ent.isDir || ent.name.startsWith('_') || ent.name.startsWith('.')) continue;
    try {
      const skillMd = await stat(join(skillsDir, ent.name, 'SKILL.md'));
      if (skillMd.isFile()) return { path: 'skills' };
    } catch {
      continue;
    }
  }
  return null;
}

export async function detectFlatCollections(root: string): Promise<FlatCollection[]> {
  const collections: FlatCollection[] = [];
  for (const [dirName, suggestedAs] of Object.entries(FLAT_COLLECTION_DIRS)) {
    const dirPath = join(root, dirName);
    const entries = await listDirEntries(dirPath);
    const shapeHits = new Set<FileShape>();
    for (const ent of entries) {
      if (!ent.isFile) continue;
      if (isBoilerplate(ent.name)) continue;
      const shape = classifyFileShape(ent.name);
      if (shape) shapeHits.add(shape);
    }
    for (const shape of shapeHits) {
      collections.push({ path: dirName, suggestedAs, fileShape: shape });
    }
  }
  return collections;
}

export async function detectToolNativeManifests(root: string): Promise<ToolNativeManifest[]> {
  const manifests: ToolNativeManifest[] = [];
  for (const name of PLUGIN_MANIFESTS) {
    if (await dirExists(join(root, name))) {
      manifests.push({ path: name });
    }
  }
  return manifests;
}
