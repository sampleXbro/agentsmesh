/**
 * Pi `defaultTools` -> canonical `permissions.yaml`.
 *
 * Reads `.pi/settings.json` in project scope and `~/.pi/agent/settings.json` in
 * global scope. The write is key-scoped: only `allow` is rewritten, and even
 * there the entries Pi cannot express (`Bash(npm test:*)`, `WebFetch`) are kept,
 * along with the comments attached to the entries that survive. `deny`, `ask`
 * and every other key are untouched.
 *
 * An EMPTY `defaultTools` is ignored rather than treated as a revocation. It is
 * the array generation itself writes when canonical projects to no built-in, so
 * reading it back would clear canonical `allow` for every other target too.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { canonicalDocument } from '../import/yaml-import-helpers.js';
import { dirname, join } from 'node:path';
import { Document, YAMLSeq, isScalar, isSeq } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { toStringArray } from '../import/shared-import-helpers.js';
import { mergeImportedAllow, parseDefaultTools } from './permissions-format.js';
import {
  PI_AGENT_TARGET,
  PI_AGENT_SETTINGS_FILE,
  PI_AGENT_GLOBAL_SETTINGS_FILE,
} from './constants.js';

/**
 * Rewrite one canonical list, reusing the node of every entry that survives so
 * the comment the user wrote next to it (`- Grep # ripgrep only`) survives too.
 */
function setEntries(doc: Document, key: string, entries: readonly string[]): void {
  const previous = doc.get(key, true);
  const seq = isSeq(previous) ? (previous as YAMLSeq<unknown>) : new YAMLSeq<unknown>();
  const byValue = new Map<string, unknown>();
  for (const item of seq.items) {
    if (isScalar(item) && typeof item.value === 'string') byValue.set(item.value, item);
  }
  seq.items = entries.map((entry) => byValue.get(entry) ?? doc.createNode(entry));
  doc.set(key, seq);
}

export async function importPiAgentPermissions(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
): Promise<void> {
  const rel = scope === 'global' ? PI_AGENT_GLOBAL_SETTINGS_FILE : PI_AGENT_SETTINGS_FILE;
  const srcPath = join(projectRoot, rel);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  const tools = parseDefaultTools(content);
  if (tools === null || tools.length === 0) return;

  const destPath = join(projectRoot, AB_PERMISSIONS);
  const doc = canonicalDocument(await readFileSafe(destPath));
  const existing = (doc.toJS() ?? {}) as Record<string, unknown>;
  setEntries(doc, 'allow', mergeImportedAllow(toStringArray(existing.allow), tools));
  if (!doc.has('deny')) setEntries(doc, 'deny', []);

  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, doc.toString().trimEnd() + '\n');
  results.push({
    fromTool: PI_AGENT_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}
