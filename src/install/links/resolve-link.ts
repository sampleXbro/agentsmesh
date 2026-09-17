/**
 * Install-time classification of relative markdown links against the
 * imported-content scope (B1).
 *
 * Each link surfaced by `scan-relative-links` is classified into one of:
 *
 *   - `in-tree-included`   target exists on disk AND is part of the install scope
 *   - `resolvable-outside` target exists on disk but lives outside the install scope
 *   - `unresolvable`       target does not exist OR escapes `contentRoot`
 *
 * The classification drives the B1 prompt: `i` copies `resolvable-outside`
 * targets into per-entity supporting files; `l` leaves them unchanged with a
 * warning; `a` aborts the install. Links escaping `contentRoot` are treated
 * as unresolvable for security (the install must not pull arbitrary files
 * out of the host filesystem).
 *
 * Anchors (`#section`) are stripped before resolution but echoed back on the
 * result so callers can preserve them when rewriting a link.
 */

import { exists as pathExists } from '../../utils/filesystem/fs.js';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import type { ScannedLink } from './scan-relative-links.js';

export interface ResolveLinkInput {
  readonly link: ScannedLink;
  /** Path of the markdown file the link came from, relative to `contentRoot` (forward-slash). */
  readonly fromFile: string;
  /** Absolute path of the source repo's content root. */
  readonly contentRoot: string;
  /** Paths (relative to `contentRoot`, forward-slash) included in the install scope. */
  readonly includedPaths: ReadonlySet<string>;
}

interface ResolvedLinkCommon {
  readonly link: ScannedLink;
  /** `#fragment` portion of the original link, including the leading `#`; empty when none. */
  readonly anchor: string;
}

/** Target exists on disk AND is part of the install scope. */
export interface InTreeIncludedLink extends ResolvedLinkCommon {
  readonly classification: 'in-tree-included';
  /** Path resolved relative to `contentRoot` (forward-slash, anchor-stripped). */
  readonly resolvedRelative: string;
}

/** Target exists on disk but lives outside the install scope. */
export interface ResolvableOutsideLink extends ResolvedLinkCommon {
  readonly classification: 'resolvable-outside';
  /** Path resolved relative to `contentRoot` (forward-slash, anchor-stripped). */
  readonly resolvedRelative: string;
}

/** Target does not exist OR escapes `contentRoot`. */
export interface UnresolvableLink extends ResolvedLinkCommon {
  readonly classification: 'unresolvable';
  /** Path resolved relative to `contentRoot`, or `null` when the link escapes contentRoot or is empty/absolute. */
  readonly resolvedRelative: string | null;
}

export type ResolvedLink = InTreeIncludedLink | ResolvableOutsideLink | UnresolvableLink;

function splitAnchor(p: string): { path: string; anchor: string } {
  const hashIdx = p.indexOf('#');
  if (hashIdx < 0) return { path: p, anchor: '' };
  return { path: p.slice(0, hashIdx), anchor: p.slice(hashIdx) };
}

function toForwardSlash(p: string): string {
  return p.split(sep).join('/');
}

export async function resolveLink(input: ResolveLinkInput): Promise<ResolvedLink> {
  const { link, fromFile, contentRoot, includedPaths } = input;
  const { path: rawPath, anchor } = splitAnchor(link.path);

  if (rawPath === '' || isAbsolute(rawPath)) {
    return { link, classification: 'unresolvable', resolvedRelative: null, anchor };
  }

  // Pass native-separator paths to `resolve()`; normalize to forward-slash
  // only on the way out so the result is portable for downstream consumers.
  const fromDir = join(contentRoot, fromFile, '..');
  const targetAbs = normalize(resolve(fromDir, rawPath));
  const rootAbs = normalize(resolve(contentRoot));

  const rel = relative(rootAbs, targetAbs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { link, classification: 'unresolvable', resolvedRelative: null, anchor };
  }

  const relForward = toForwardSlash(rel);
  const exists = await pathExists(targetAbs);
  if (!exists) {
    return { link, classification: 'unresolvable', resolvedRelative: relForward, anchor };
  }

  if (includedPaths.has(relForward)) {
    return { link, classification: 'in-tree-included', resolvedRelative: relForward, anchor };
  }
  return { link, classification: 'resolvable-outside', resolvedRelative: relForward, anchor };
}
