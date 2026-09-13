/**
 * Drop a single entry from `agentsmesh.yaml`'s `extends:` list.
 *
 * Used by `agentsmesh uninstall` when the install was originally written via
 * `--extends`. The mirror operation to `writeInstallAsExtend` /
 * `mergeExtendList` — an in-place document edit so comments and unrelated keys
 * (`targets:`, `features:`, anything unmodelled) survive. Atomic write via
 * `writeFileAtomic`.
 *
 * Returns `true` when an entry was found and the file was rewritten, `false`
 * when no entry matched and the file is unchanged.
 */

import { parseDocument, parse as parseYaml } from 'yaml';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import type { ValidatedConfig } from '../../config/core/schema.js';

export async function removeAgentsmeshExtendByName(
  configPath: string,
  config: ValidatedConfig,
  name: string,
): Promise<boolean> {
  if (!config.extends.some((e) => e.name === name)) return false;

  const content = await readFileSafe(configPath);
  if (content === null) throw new Error(`Missing config: ${configPath}`);

  const raw = parseYaml(content) as Record<string, unknown>;
  const rawExtends = Array.isArray(raw.extends) ? (raw.extends as unknown[]) : [];
  const next = rawExtends.filter((entry) => {
    if (typeof entry !== 'object' || entry === null) return true;
    return (entry as { name?: unknown }).name !== name;
  });
  if (next.length === rawExtends.length) return false;

  // In-place edit keeps comments and unmodelled keys; see yaml-writer.ts.
  const doc = parseDocument(content);
  doc.set('extends', doc.createNode(next));
  const out = doc.toString({ indent: 2, lineWidth: 0 });
  await writeFileAtomic(configPath, out.endsWith('\n') ? out : `${out}\n`);
  return true;
}
