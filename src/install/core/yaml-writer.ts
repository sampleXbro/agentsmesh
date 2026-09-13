/**
 * Write agentsmesh.yaml after merging extends (full-document stringify).
 */

import { parseDocument, parse as parseYaml } from 'yaml';
import { configSchema, type ValidatedConfig } from '../../config/core/schema.js';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { mergeExtendList, type NewExtendEntry } from './merge-extend-entry.js';

/**
 * The extends the shared config file declares on its own.
 *
 * `currentConfig` arrives from `loadScopedConfig`, which has already merged
 * `agentsmesh.local.yaml` — the gitignored, per-developer override. Merging the
 * new entry into that list copied every private extend into the committed file.
 * Re-validating the raw document keeps the write scoped to what the shared file
 * actually says; a document that cannot validate alone falls back to the merged
 * list rather than dropping entries.
 */
function projectExtends(
  raw: Record<string, unknown>,
  currentConfig: ValidatedConfig,
): ValidatedConfig['extends'] {
  const declared = Array.isArray(raw.extends) ? raw.extends : [];
  const parsed = configSchema.safeParse({ version: 1, extends: declared });
  if (parsed.success) return parsed.data.extends;

  // The shared file declares extends this version cannot validate on their own
  // (a hand-written entry with no `features`, say). Narrow the merged list to
  // the names it declares rather than writing entries it never mentioned.
  const declaredNames = new Set(
    declared
      .map((e) => (e as { name?: unknown }).name)
      .filter((n): n is string => typeof n === 'string'),
  );
  return currentConfig.extends.filter((e) => declaredNames.has(e.name));
}

/**
 * Merge extends into config on disk and write YAML.
 */
export async function writeAgentsmeshWithNewExtend(
  configPath: string,
  currentConfig: ValidatedConfig,
  entry: NewExtendEntry,
): Promise<void> {
  const content = await readFileSafe(configPath);
  if (content === null) throw new Error(`Missing config: ${configPath}`);

  const raw = parseYaml(content) as Record<string, unknown>;
  const mergedExtends = mergeExtendList(projectExtends(raw, currentConfig), entry);

  // Edit the parsed document in place rather than re-stringifying a plain
  // object: `agentsmesh.yaml` is hand-authored and committed, so a round trip
  // through `parse` + `stringify` silently dropped the user's comments and any
  // key this version does not model.
  const doc = parseDocument(content);
  doc.set('extends', doc.createNode(mergedExtends));
  const out = doc.toString({ indent: 2, lineWidth: 0 });
  await writeFileAtomic(configPath, out.endsWith('\n') ? out : `${out}\n`);
}
