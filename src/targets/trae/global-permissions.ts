/**
 * Global-scope permissions for Trae.
 *
 * docs.trae.ai/ide/permission-and-approval places every rule in the user-level
 * `~/.trae/permission/global.json` — even per-workspace paths, which are written
 * inside that same file using the `$WORKSPACE_FOLDER` variable. There is no
 * project-tier permission file, so this is wired through
 * `globalSupport.scopeExtras` (gated on `scope === 'global'`) rather than a
 * plain `generatePermissions`, which would also run at project scope and leak
 * the file into the repo.
 *
 * The path stays out of `managedOutputs`: it is the user's own config and stale
 * cleanup deletes every managed file a run does not emit.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { stringList } from '../import/yaml-import-helpers.js';
import { dirname, join } from 'node:path';
import { Document, isMap, parseDocument } from 'yaml';
import type { CanonicalFiles, GenerateResult, ImportResult } from '../../core/types.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { computeStatus } from '../../core/generate/feature-loop.js';
import { serializeTraePermissions } from './permissions-file.js';
import { mapsToTraeKey, traeToPermissions, type TraeList } from './permissions-format.js';
import { TRAE_TARGET, TRAE_GLOBAL_PERMISSIONS_FILE } from './constants.js';

export { serializeTraePermissions };

const LISTS: readonly TraeList[] = ['allow', 'deny', 'ask'];

export async function generateTraeGlobalPermissions(
  canonical: CanonicalFiles,
  projectRoot: string,
  enabledFeatures: ReadonlySet<string>,
): Promise<GenerateResult[]> {
  if (!enabledFeatures.has('permissions')) return [];

  const existing = await readFileSafe(join(projectRoot, TRAE_GLOBAL_PERMISSIONS_FILE));
  const content = serializeTraePermissions(canonical.permissions, existing);
  if (content === null) return [];

  return [
    {
      target: TRAE_TARGET,
      path: TRAE_GLOBAL_PERMISSIONS_FILE,
      content,
      currentContent: existing ?? undefined,
      status: computeStatus(existing, content),
    },
  ];
}

/** The canonical file as an editable document; comments and key order survive. */
function canonicalDocument(content: string | null): Document {
  if (content !== null) {
    const doc = parseDocument(content);
    if (doc.errors.length === 0 && isMap(doc.contents)) return doc;
  }
  return new Document({});
}

/**
 * `readWrite` flattens canonical `Edit(p)` and `Write(p)` into one entry, so
 * keep whichever spelling canonical already used instead of renaming it.
 */
function alignSpelling(existing: readonly string[], pattern: string): string {
  if (!pattern.startsWith('Edit(')) return pattern;
  const alias = `Write(${pattern.slice('Edit('.length)}`;
  return existing.includes(alias) ? alias : pattern;
}

/**
 * `readWrite` also swallows `Read(p)` when the same path is writable, so the
 * file cannot report that entry back — it is preserved, not treated as removed.
 */
function foldedIntoReadWrite(pattern: string, aligned: readonly string[]): boolean {
  if (!pattern.startsWith('Read(')) return false;
  const tail = pattern.slice('Read('.length);
  return aligned.includes(`Edit(${tail}`) || aligned.includes(`Write(${tail}`);
}

/** Replace what Trae expresses; keep canonical entries it cannot represent. */
function mergeList(existing: readonly string[], imported: string[], list: TraeList): string[] {
  const aligned = imported.map((pattern) => alignSpelling(existing, pattern));
  const preserved = existing.filter(
    (pattern) => !mapsToTraeKey(pattern, list) || foldedIntoReadWrite(pattern, aligned),
  );
  return [...aligned, ...preserved.filter((pattern) => !aligned.includes(pattern))];
}

/**
 * Import `~/.trae/permission/global.json` into canonical `permissions.yaml`.
 * Key-scoped in both directions: only the entries Trae can express are
 * rewritten, an untouched list is only written when canonical already had it
 * (so import never invents `ask: []`), and comments survive.
 */
export async function importTraeGlobalPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, TRAE_GLOBAL_PERMISSIONS_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  const permissions = traeToPermissions(parsed);
  if (permissions === null) return;

  const destPath = join(projectRoot, AB_PERMISSIONS);
  const doc = canonicalDocument(await readFileSafe(destPath));
  const existing = doc.toJS() as Record<string, unknown>;
  for (const list of LISTS) {
    const merged = mergeList(stringList(existing[list]), permissions[list], list);
    // `allow`/`deny` are the canonical schema's own keys, so they are always
    // written; `ask` is optional and is only written when it already means
    // something, so import never invents an empty list.
    if (list !== 'ask' || merged.length > 0 || doc.has(list)) doc.set(list, merged);
  }

  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, doc.toString().trimEnd() + '\n');
  results.push({
    fromTool: TRAE_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}
