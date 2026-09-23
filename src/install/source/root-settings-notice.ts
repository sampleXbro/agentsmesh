/**
 * Settings (mcp.json, hooks.yaml, permissions.yaml, ignore) install only from a
 * source's own `.agentsmesh/` folder. The same files at the root of any other
 * layout are not read — which used to happen without a word.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { detectCanonical } from '../classify/detectors/root-shape.js';

const ROOT_SETTINGS_FILES = ['mcp.json', 'hooks.yaml', 'permissions.yaml', 'ignore'] as const;

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

/** Settings files at the root of a non-canonical source, which install ignores. */
export async function ignoredRootSettings(contentRoot: string): Promise<string[]> {
  if ((await detectCanonical(contentRoot)) !== null) return [];
  const found: string[] = [];
  for (const name of ROOT_SETTINGS_FILES) {
    if (await isFile(join(contentRoot, name))) found.push(name);
  }
  return found;
}

export function rootSettingsNotice(files: readonly string[]): string {
  return (
    `Ignored ${files.join(', ')} at the source root: install reads settings only from a ` +
    "source's .agentsmesh/ folder. Move them into .agentsmesh/ in the source to install them."
  );
}
