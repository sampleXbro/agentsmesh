/**
 * Claude Code plugin marketplace manifest parser.
 *
 * Reads `.claude-plugin/marketplace.json` at a source root and resolves each
 * `plugins[].source` to a sub-pack with its detected layout. Used by the
 * layout classifier so repos like `SimoneAvogadro/android-reverse-engineering-skill`
 * surface as installable marketplaces (including the singleton-plugin case
 * which the directory-heuristic detector rejects with its `>= 2` threshold).
 */

import { dirExists } from './detectors/fs-helpers.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FlatSourceLayout, SubPack } from './layout-types.js';

const MANIFEST_REL_PATH = ['.claude-plugin', 'marketplace.json'];

/**
 * Normalize a marketplace.json `source` field to a path relative to the
 * content root. Strips leading `./` and any trailing `/`. Returns `null` for
 * absolute paths or paths that escape the content root via `..`.
 */
function normalizeSource(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.startsWith('/')) return null;
  const trimmed = raw.replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (trimmed.split('/').some((seg) => seg === '..')) return null;
  return trimmed;
}

/**
 * Resolve marketplace plugin sources to `SubPack[]`.
 *
 * @param root - Absolute content root path.
 * @param detectLayout - Callback that returns the layout for a sub-pack path.
 *                       Injected to avoid an import cycle with `layout-detect.ts`.
 * @param hasContent - Predicate to decide whether a layout has installable content.
 * @returns Sub-packs from the manifest, or `null` when the manifest is missing
 *          or unparseable (caller falls back to heuristic directory scanning).
 */
export async function detectMarketplaceSubPacks(
  root: string,
  detectLayout: (path: string, relPrefix: string) => Promise<FlatSourceLayout>,
  hasContent: (layout: FlatSourceLayout) => boolean,
): Promise<SubPack[] | null> {
  const manifestPath = join(root, ...MANIFEST_REL_PATH);
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { plugins?: unknown }).plugins)
  ) {
    return null;
  }
  const plugins = (parsed as { plugins: unknown[] }).plugins;
  const packs: SubPack[] = [];
  for (const entry of plugins) {
    if (typeof entry !== 'object' || entry === null) continue;
    const src = normalizeSource((entry as { source?: unknown }).source);
    if (!src) continue;
    const childPath = join(root, src);
    if (!(await dirExists(childPath))) continue;
    const layout = await detectLayout(childPath, src);
    if (hasContent(layout)) packs.push({ path: src, layout });
  }
  return packs;
}
