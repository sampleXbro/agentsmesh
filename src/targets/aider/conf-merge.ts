/**
 * Key-scoped, ownership-scoped merge for `.aider.conf.yml`.
 *
 * `.aider.conf.yml` is the user's own aider config — model, API keys, editor
 * settings, dozens of unrelated keys — so agentsmesh never rewrites the file
 * wholesale and never deletes a key it did not write. Ownership is recorded in
 * the file itself: every key agentsmesh writes gets a `# agentsmesh:` comment
 * above it, which YAML preserves and aider ignores. So:
 *
 *   - a hook key in the projection    -> written and marked;
 *   - a MARKED hook key that dropped out of the projection -> deleted, which is
 *     how a revoked canonical hook stops running in aider;
 *   - an UNMARKED hook key            -> left alone.
 *
 * `auto-lint` / `auto-test` are switches rather than content: an explicit,
 * unmarked value is never flipped, because flipping it would also change what
 * the user's own commands do. `read` is a user-editable list agentsmesh only
 * contributes `CONVENTIONS.md` to, so it is unioned and never marked.
 */

import { isRecord } from '../../utils/types/guards.js';
import { Document, Pair, Scalar, YAMLMap, isMap, isScalar, parseDocument } from 'yaml';
import { AIDER_HOOK_KEYS } from './hooks-format.js';

/** Written above every key agentsmesh owns; its presence is the ownership proof. */
export const AIDER_MANAGED_COMMENT = ' agentsmesh: generated from .agentsmesh/ — do not edit';

/** Switches whose explicit user value is respected instead of overwritten. */
const SWITCH_KEYS = new Set(['auto-lint', 'auto-test']);

/** A document whose contents are always a map, so key lookups need no guard. */
type ConfDocument = Document<YAMLMap<unknown, unknown>, false>;

/** The existing config as an editable document; comments and key order survive. */
function baseDocument(content: string | null): ConfDocument {
  if (content !== null && content.trim() !== '') {
    const doc = parseDocument(content);
    if (doc.errors.length === 0 && isMap(doc.contents)) return doc as unknown as ConfDocument;
  }
  return new Document({}) as ConfDocument;
}

/** The map entry for `key`, when its key node is the kind that carries comments. */
function pairFor(doc: ConfDocument, key: string): Pair<Scalar, unknown> | null {
  for (const item of doc.contents.items) {
    if (isScalar(item.key) && item.key.value === key) return item as Pair<Scalar, unknown>;
  }
  return null;
}

function isMarked(pair: Pair<Scalar, unknown> | null): boolean {
  if (pair === null) return false;
  const comment = pair.key.commentBefore;
  return typeof comment === 'string' && comment.includes('agentsmesh:');
}

/** Set `key` and mark it as agentsmesh-owned, replacing any existing entry. */
function setManaged(doc: ConfDocument, key: string, value: unknown): void {
  const existing = pairFor(doc, key);
  if (existing !== null) {
    existing.key.commentBefore = AIDER_MANAGED_COMMENT;
    existing.value = doc.createNode(value);
    return;
  }
  const name = new Scalar(key);
  name.commentBefore = AIDER_MANAGED_COMMENT;
  doc.add(new Pair(name, doc.createNode(value)));
}

function readEntries(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function applyRead(doc: ConfDocument, projected: unknown): void {
  const current: unknown = (doc.toJS() as Record<string, unknown> | null)?.read;
  const merged = new Set(readEntries(current));
  for (const entry of readEntries(projected)) merged.add(entry);
  doc.set('read', [...merged]);
}

function applyHookKeys(doc: ConfDocument, projected: Record<string, unknown>): void {
  for (const key of AIDER_HOOK_KEYS) {
    const pair = pairFor(doc, key);
    if (!(key in projected)) {
      if (isMarked(pair)) doc.delete(key);
      continue;
    }
    // A switch the user set by hand stays as it is; agentsmesh only supplies
    // the default it would otherwise have to assume.
    if (SWITCH_KEYS.has(key) && pair !== null && !isMarked(pair)) continue;
    setManaged(doc, key, projected[key]);
  }
}

/** True when the file on disk still carries a key a previous run marked as ours. */
export function hasManagedAiderKeys(content: string | null): boolean {
  const doc = baseDocument(content);
  return AIDER_HOOK_KEYS.some((key) => isMarked(pairFor(doc, key)));
}

export function mergeAiderConf(base: string | null, newContent: string): string {
  const doc = baseDocument(base);
  const parsed: unknown = newContent.trim() === '' ? {} : parseDocument(newContent).toJS();
  const projected = isRecord(parsed) ? parsed : {};

  if ('read' in projected) applyRead(doc, projected.read);
  applyHookKeys(doc, projected);

  if (doc.contents.items.length === 0) return '';
  return doc.toString();
}
