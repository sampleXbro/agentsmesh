/**
 * Kiro permission generation — two surfaces, one per scope.
 *
 * GLOBAL: `~/.kiro/settings/permissions.yaml`, the user-scoped file the docs
 * describe as one of the two levels permissions are defined at. It is wired
 * through `globalSupport.scopeExtras` (gated on `scope === 'global'`) rather
 * than a plain `generatePermissions`, which would also run at project scope.
 * There is deliberately no project file: the docs put workspace rules at
 * `~/.kiro/workspace-roots/<hash>/permissions.yaml`, outside the repository, so
 * that "a cloned repo cannot inject permission rules", and Kiro hard-denies
 * agent writes to `.kiro/settings/` anyway.
 *
 * Ownership inside that file is per RULE, not per key: agentsmesh rewrites only
 * the rules whose shape it emits (see `isOwnedKiroRule`) and preserves every
 * other one — `exclude` protections, unknown capabilities, rules carrying extra
 * keys — along with all other top-level keys and comments. Owned rules are
 * rewritten on every run and disappear when canonical revokes them, except for
 * an effect whose list permissions.yaml does not manage: those stay. A file that
 * does not parse is left completely alone rather than replaced. The path stays
 * out of `managedOutputs` so stale cleanup never deletes a user's file.
 *
 * PROJECT: the agent scope from the same docs table, "embedded in agent profile
 * (permissions field)". agentsmesh already writes `.kiro/agents/<name>.md`, so
 * the rules are folded into that frontmatter. Every embedded key is gated on
 * its own feature, which is why this runs from `emitScopedSettings` — the only
 * generate-time hook that receives the enabled feature set.
 */

import { join } from 'node:path';
import { Document, YAMLSeq, parseDocument, isMap, isSeq } from 'yaml';
import type { CanonicalFiles, GenerateResult, Permissions } from '../../core/types.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { computeStatus } from '../../core/generate/feature-loop.js';
import { PERMISSION_LISTS, managedLists } from '../../core/permissions.js';
import { buildKiroAgentOutputs } from './generator.js';
import { canonicalToKiroRules, isOwnedKiroRule } from './permissions-lists.js';
import { KIRO_TARGET, KIRO_GLOBAL_PERMISSIONS_FILE } from './constants.js';

/**
 * The existing file as an editable document; comments and key order survive.
 * `null` means the file is there but unreadable as a permission map — the
 * caller then writes nothing at all, because one syntax error must not cost the
 * user every rule they wrote.
 */
function permissionsDocument(content: string | null): Document | null {
  if (content === null) return new Document({});
  const doc = parseDocument(content);
  if (doc.errors.length > 0) return null;
  if (doc.contents !== null && !isMap(doc.contents)) return null;
  return doc;
}

/** The existing `rules` node, reused in place so its comments and style survive. */
function rulesSeq(doc: Document): YAMLSeq<unknown> {
  const node = doc.get('rules', true);
  return isSeq(node) ? (node as YAMLSeq<unknown>) : new YAMLSeq<unknown>();
}

/**
 * The rule nodes to keep exactly as the user wrote them: every rule agentsmesh
 * does not own, and an owned-shaped rule whose effect permissions.yaml does not
 * manage (its list is missing there).
 */
function keptRules(seq: YAMLSeq<unknown>, managed: ReadonlySet<string>): unknown[] {
  const plain = seq.toJSON() as unknown[];
  return seq.items.filter((_item, index) => {
    const rule = plain[index];
    return !isOwnedKiroRule(rule) || !managed.has(String((rule as { effect: unknown }).effect));
  });
}

/**
 * Merge canonical permissions into an existing `permissions.yaml`. `null` means
 * "leave the file alone": no permissions.yaml list is managed, nothing is to be
 * written and no `rules` key is on disk to clear, or the file does not parse.
 */
export function buildKiroPermissionsYaml(
  permissions: Permissions | null,
  existingContent: string | null,
): string | null {
  const managed = new Set(Object.keys(managedLists(permissions, PERMISSION_LISTS)));
  if (managed.size === 0) return null;
  const doc = permissionsDocument(existingContent);
  if (doc === null) return null;
  const rules = canonicalToKiroRules(permissions);
  if (rules.length === 0 && !doc.has('rules')) return null;

  const seq = rulesSeq(doc);
  seq.items = [...keptRules(seq, managed), ...rules.map((rule) => doc.createNode(rule))];
  seq.flow = false;
  doc.set('rules', seq);
  return doc.toString().trimEnd() + '\n';
}

export async function generateKiroGlobalPermissions(
  canonical: CanonicalFiles,
  projectRoot: string,
  scope: TargetLayoutScope,
  enabledFeatures: ReadonlySet<string>,
): Promise<GenerateResult[]> {
  if (scope !== 'global' || !enabledFeatures.has('permissions')) return [];

  const existing = await readFileSafe(join(projectRoot, KIRO_GLOBAL_PERMISSIONS_FILE));
  const content = buildKiroPermissionsYaml(canonical.permissions, existing);
  if (content === null) return [];

  return [
    {
      target: KIRO_TARGET,
      path: KIRO_GLOBAL_PERMISSIONS_FILE,
      content,
      currentContent: existing ?? undefined,
      status: computeStatus(existing, content),
    },
  ];
}

/**
 * Re-emit each agent profile with the canonical rules embedded. Project scope
 * only — a global agent is already covered by the user-scoped permissions.yaml,
 * which applies across all projects.
 */
export function emitKiroAgentPermissions(
  canonical: CanonicalFiles,
  scope: TargetLayoutScope,
  enabledFeatures: ReadonlySet<string>,
): readonly FeatureGeneratorOutput[] {
  if (scope !== 'project') return [];
  if (!enabledFeatures.has('agents') || !enabledFeatures.has('permissions')) return [];
  const rules = canonicalToKiroRules(canonical.permissions);
  if (rules.length === 0) return [];
  return buildKiroAgentOutputs(canonical, rules);
}
