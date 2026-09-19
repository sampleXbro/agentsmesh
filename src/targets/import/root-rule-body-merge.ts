/**
 * Root-rule body merge.
 *
 * `.agentsmesh/rules/_root.md` is the single canonical slot that every target's
 * root instruction collapses into. That makes it the one canonical path where a
 * collision is NOT two descriptions of the same entity: a command named `ship`
 * imported from two tools really is one command (last import wins), but
 * `CLAUDE.md` and an always-apply Cursor rule are different rules that merely
 * share a destination. Replacing there destroys the user's instructions and the
 * next `generate` writes the survivor back over the original file.
 *
 * So root-rule bodies accumulate, following `writeMcpWithMerge` (servers
 * accumulate across sequential imports) and the kimi-code importer (which
 * already joins its two root sources with a blank line). Every other canonical
 * path keeps last-import-wins.
 *
 * Containment checks in both directions keep repeated imports stable: an
 * unchanged re-import adds nothing, and a source that gained lines upstream
 * supersedes the shorter body instead of being appended beside it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT_RULE_PLACEHOLDER_BODY } from '../../canonical/root-rule-placeholder.js';
import { AB_ROOT_RULE } from '../../core/canonical-paths.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';

/** Line endings are normalized so a CRLF-authored source still de-duplicates. */
function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim();
}

const PLACEHOLDER = normalizeBody(ROOT_RULE_PLACEHOLDER_BODY);

/**
 * `init` seeds an empty root rule with a placeholder. It is scaffolding, not
 * the user's content, so the first real import replaces it outright instead of
 * keeping it above every imported rule forever.
 */
function isUnwritten(body: string): boolean {
  return body.length === 0 || body === PLACEHOLDER;
}

/**
 * Combine an existing canonical root body with a newly imported one.
 *
 * Returns the body to write. Compare against `existingBody` to tell whether the
 * import contributed anything.
 */
export function mergeRootRuleBody(existingBody: string, incomingBody: string): string {
  const existing = normalizeBody(existingBody);
  const incoming = normalizeBody(incomingBody);
  if (isUnwritten(existing)) return incoming;
  if (incoming.length === 0) return existing;
  // Already present — an unchanged re-import must not duplicate content.
  if (existing.includes(incoming)) return existing;
  // The source grew upstream; the longer body replaces the one it contains.
  if (incoming.includes(existing)) return incoming;
  return `${existing}\n\n${incoming}`;
}

/**
 * Body of the canonical root rule under `rootBase`, or `''` when there is none.
 * Sampled either side of an import so the CLI can report that two tools' root
 * rules were combined rather than one silently replacing the other.
 */
export function readRootRuleBody(rootBase: string): string {
  const rootRule = join(rootBase, AB_ROOT_RULE);
  if (!existsSync(rootRule)) return '';
  return parseFrontmatter(readFileSync(rootRule, 'utf8')).body;
}

/**
 * True when an import accumulated onto an existing root body rather than
 * seeding an empty one or leaving it untouched. Drives the CLI's "merged"
 * notice, so the user is told their root rule now holds more than one source.
 */
export function rootRuleBodyGrew(before: string, after: string): boolean {
  const start = normalizeBody(before);
  const end = normalizeBody(after);
  return !isUnwritten(start) && end !== start && end.includes(start);
}
