/**
 * Kiro permissions -> canonical `permissions.yaml`.
 *
 * Global scope reads the user-scoped `~/.kiro/settings/permissions.yaml`;
 * project scope reads the `permissions.rules` frontmatter of every agent
 * profile and collapses them (see `permissions-profiles.ts`).
 *
 * The write is narrow in three ways, because canonical is shared with every
 * other target and a bad import corrupts all of them:
 *
 *  - nothing is written at all unless the Kiro side yields at least one rule,
 *    so the `rules: []` file that revocation itself writes cannot clear
 *    canonical;
 *  - a canonical list is only rewritten when the Kiro side carries at least one
 *    rule of that effect — silence about deny is not a revocation of deny;
 *  - within a rewritten list the existing canonical spelling, the entries Kiro
 *    cannot express and the comments attached to surviving entries are kept.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { canonicalDocument } from '../import/yaml-import-helpers.js';
import { isRecord } from '../../utils/types/guards.js';
import { dirname, join } from 'node:path';
import { Document, YAMLSeq, isScalar, isSeq, parse as parseYaml } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import {
  mkdirp,
  readDirRecursiveNoSymlinks,
  readFileSafe,
  writeFileAtomic,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { toStringArray } from '../import/shared-import-helpers.js';
import type { KiroEffect, KiroPermissionRule } from './permissions-format.js';
import { mergeImportedEntries, parseKiroRules } from './permissions-lists.js';
import { mergeProfileRules } from './permissions-profiles.js';
import { KIRO_TARGET, KIRO_AGENTS_DIR, KIRO_GLOBAL_PERMISSIONS_FILE } from './constants.js';

/** Canonical key order; `ask` is only materialised when something needs it. */
const CANONICAL_EFFECTS: readonly KiroEffect[] = ['allow', 'deny', 'ask'];

/** The `rules` list of a permissions document, or `null` when there is none to read. */
function readRulesList(content: string): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.rules)) return null;
  return parsed.rules;
}

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

async function writeCanonicalPermissions(
  projectRoot: string,
  fromPath: string,
  rules: readonly KiroPermissionRule[],
  results: ImportResult[],
): Promise<void> {
  const destPath = join(projectRoot, AB_PERMISSIONS);
  const doc = canonicalDocument(await readFileSafe(destPath));
  const existing = (doc.toJS() ?? {}) as Record<string, unknown>;

  const present = new Set(rules.map((rule) => rule.effect));
  for (const effect of CANONICAL_EFFECTS) {
    if (!present.has(effect)) continue;
    setEntries(doc, effect, mergeImportedEntries(toStringArray(existing[effect]), rules, effect));
  }
  if (!doc.has('allow')) setEntries(doc, 'allow', []);
  if (!doc.has('deny')) setEntries(doc, 'deny', []);

  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, doc.toString().trimEnd() + '\n');
  results.push({
    fromTool: KIRO_TARGET,
    fromPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}

/** `~/.kiro/settings/permissions.yaml` -> canonical (global scope). */
export async function importKiroGlobalPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, KIRO_GLOBAL_PERMISSIONS_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  const raw = readRulesList(content);
  if (raw === null) return;
  const rules = parseKiroRules(raw);
  if (rules.length === 0) return;
  await writeCanonicalPermissions(projectRoot, srcPath, rules, results);
}

/** `.kiro/agents/<name>.md` frontmatter -> canonical (project scope). */
export async function importKiroAgentPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const agentsDir = join(projectRoot, KIRO_AGENTS_DIR);
  const profiles: KiroPermissionRule[][] = [];
  for (const absPath of await readDirRecursiveNoSymlinks(agentsDir)) {
    if (!absPath.endsWith('.md')) continue;
    const content = await readFileSafe(absPath);
    if (!content) continue;
    const block = parseFrontmatter(content).frontmatter.permissions;
    if (!isRecord(block) || !Array.isArray(block.rules)) continue;
    profiles.push(parseKiroRules(block.rules));
  }
  const rules = mergeProfileRules(profiles);
  if (rules.length === 0) return;
  await writeCanonicalPermissions(projectRoot, agentsDir, rules, results);
}
