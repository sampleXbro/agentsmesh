/** YAML helpers shared by the per-target settings/permissions importers. */

import { Document, isMap, parseDocument } from 'yaml';

/**
 * Parse `content` into a mapping Document, falling back to an empty one when the
 * file is absent, unparsable, or holds a non-mapping root. Keeps the importers'
 * "merge into whatever the user already has, never destroy it" contract.
 */
export function canonicalDocument(content: string | null): Document {
  if (content !== null) {
    const doc = parseDocument(content);
    if (doc.errors.length === 0 && (doc.contents === null || isMap(doc.contents))) return doc;
  }
  return new Document({});
}

/** Coerce an array YAML value into a string list, dropping non-strings. */
export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
