/**
 * Structural layout detection for install sources.
 *
 * Pure function: reads the filesystem under `contentRoot` and returns a
 * `SourceLayout` describing what's there. No scoring, no thresholds —
 * downstream code (the picker in step 3) converts shape to intent.
 *
 * Detectors live under `./detectors/`:
 *   - `fs-helpers.ts`   — `dirExists`, `listDirEntries`, `classifyFileShape`.
 *   - `root-shape.ts`   — `.agentsmesh/`, legacy `.cursorrules`/`.windsurfrules`,
 *                          root `SKILL.md`.
 *   - `collections.ts`  — `skills/<name>/SKILL.md` skill packs, flat
 *                          `rules/commands/agents/skills` collections, and
 *                          tool-native plugin manifests.
 *
 * This file composes them into `detectFlatLayout` (single directory) and
 * `detectLayout` (single directory + nested sub-pack discovery).
 */

import { join } from 'node:path';
import { detectMarketplaceSubPacks } from './marketplace-manifest.js';
import { listDirEntries } from './detectors/fs-helpers.js';
import { detectCanonical, detectRootRule, detectRootSkill } from './detectors/root-shape.js';
import {
  detectFlatCollections,
  detectSkillPack,
  detectToolNativeManifests,
} from './detectors/collections.js';
import type { FlatSourceLayout, SourceLayout, SubPack } from './layout-types.js';

async function detectFlatLayout(root: string, relPrefix: string): Promise<FlatSourceLayout> {
  const canonical = await detectCanonical(root);
  if (canonical) {
    return {
      canonical,
      skillPack: null,
      rootSkill: null,
      rootRule: null,
      flatCollections: [],
      toolNativeManifests: [],
    };
  }
  const skillPack = await detectSkillPack(root);
  const rootSkill = skillPack ? null : await detectRootSkill(root);
  const flatCollections = await detectFlatCollections(root);
  // rootRule is the lowest-priority root marker: it only fires when no
  // structured content (canonical, skillPack, rootSkill, flatCollections) is
  // present, since those represent richer install intents.
  const rootRule =
    skillPack || rootSkill || flatCollections.length > 0 ? null : await detectRootRule(root);
  const toolNativeManifests = await detectToolNativeManifests(root);
  return {
    canonical,
    skillPack: skillPack ? { path: relPrefix ? `${relPrefix}/skills` : 'skills' } : null,
    rootSkill: rootSkill ? { path: relPrefix ? `${relPrefix}/SKILL.md` : 'SKILL.md' } : null,
    rootRule: rootRule
      ? { path: relPrefix ? `${relPrefix}/${rootRule.path}` : rootRule.path }
      : null,
    flatCollections: flatCollections.map((c) => ({
      ...c,
      path: relPrefix ? `${relPrefix}/${c.path}` : c.path,
    })),
    toolNativeManifests: toolNativeManifests.map((m) => ({
      path: relPrefix ? `${relPrefix}/${m.path}` : m.path,
    })),
  };
}

function hasContent(layout: FlatSourceLayout): boolean {
  return (
    layout.canonical !== null ||
    layout.skillPack !== null ||
    layout.rootSkill !== null ||
    layout.rootRule !== null ||
    layout.flatCollections.length > 0
  );
}

async function collectSubPackCandidates(dirPath: string, relPrefix: string): Promise<SubPack[]> {
  const entries = await listDirEntries(dirPath);
  const packs: SubPack[] = [];
  for (const ent of entries) {
    if (!ent.isDir || ent.name.startsWith('.')) continue;
    const childPath = join(dirPath, ent.name);
    const childRel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const layout = await detectFlatLayout(childPath, childRel);
    if (hasContent(layout)) packs.push({ path: childRel, layout });
  }
  return packs;
}

async function detectSubPacks(root: string, rootLayout: FlatSourceLayout): Promise<SubPack[]> {
  if (hasContent(rootLayout)) return [];
  const manifestPacks = await detectMarketplaceSubPacks(root, detectFlatLayout, hasContent);
  if (manifestPacks && manifestPacks.length > 0) return manifestPacks;
  const directCandidates = await collectSubPackCandidates(root, '');
  // Two-or-more direct sub-pack candidates is the documented marketplace
  // signal: a single sub-pack is more likely a misclassified flat repo.
  if (directCandidates.length >= 2) return directCandidates;
  const entries = await listDirEntries(root);
  for (const ent of entries) {
    if (!ent.isDir || ent.name.startsWith('.')) continue;
    const nested = await collectSubPackCandidates(join(root, ent.name), ent.name);
    if (nested.length >= 2) return nested;
  }
  return [];
}

export async function detectLayout(contentRoot: string): Promise<SourceLayout> {
  const rootLayout = await detectFlatLayout(contentRoot, '');
  if (rootLayout.canonical) {
    return { ...rootLayout, subPacks: [] };
  }
  const subPacks = await detectSubPacks(contentRoot, rootLayout);
  return { ...rootLayout, subPacks };
}
