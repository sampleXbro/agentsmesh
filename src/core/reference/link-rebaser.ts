import {
  normalizeForProject,
  normalizeSeparators,
  pathApi,
  stripTrailingPunctuation,
  WINDOWS_ABSOLUTE_PATH,
} from '../path-helpers.js';
import {
  PATH_TOKEN,
  LINE_NUMBER_SUFFIX,
  isGlobAdjacent,
  isRootRelativePathToken,
} from './link-rebaser-helpers.js';
import { protectedRanges } from './protected-ranges.js';
import { formatLinkPathForDestination, isUnderAgentsMesh } from './link-rebaser-output.js';
import { resolveLinkTarget } from './link-rebaser-resolution.js';
import { decodeLinkPath, encodeLinkPath } from './link-uri-encoding.js';
import {
  isMarkdownLinkDestinationToken,
  isRelativePathToken,
  isTildeHomeRelativePathToken,
} from './link-token-guards.js';
import { getTokenContext, shouldRewritePathToken } from './link-token-context.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';

export interface RewriteFileLinksInput {
  content: string;
  projectRoot: string;
  sourceFile: string;
  destinationFile: string;
  translatePath: (absolutePath: string) => string;
  pathExists: (absolutePath: string) => boolean;
  explicitCurrentDirLinks?: boolean;
  rewriteBarePathTokens?: boolean;
  /** Rewrite Markdown link destinations only; leave every other path token as written. */
  markdownLinksOnly?: boolean;
  /** `global`: leave links unchanged when they resolve outside `.agentsmesh/`. */
  scope?: TargetLayoutScope;
  /** For project scope: distinguish directory targets without a trailing slash in the link. */
  pathIsDirectory?: (absolutePath: string) => boolean;
}
export interface RewriteFileLinksResult {
  content: string;
  missing: string[];
}

/**
 * True for `/word` — one segment, no extension, no trailing slash. Written that
 * way it is a command in prose, not a path. `/docs/`, `/src/app.ts` and
 * `/AGENTS.md` all remain paths.
 */
function isSlashCommandToken(normalizedToken: string): boolean {
  return /^\/[A-Za-z][A-Za-z0-9-]*$/.test(normalizedToken);
}

export function rewriteFileLinks(input: RewriteFileLinksInput): RewriteFileLinksResult {
  const missing = new Set<string>();
  const protectedRefRanges = protectedRanges(input.content);
  const content = input.content.replace(PATH_TOKEN, (match, offset, fullContent) => {
    if (protectedRefRanges.some(([start, end]) => offset >= start && offset < end)) return match;
    if (
      !shouldRewritePathToken(
        fullContent,
        offset,
        offset + match.length,
        match,
        input.rewriteBarePathTokens === true,
      )
    ) {
      return match;
    }
    if (isTildeHomeRelativePathToken(fullContent, offset, match)) return match;
    if (isGlobAdjacent(fullContent, offset, offset + match.length)) return match;
    const { candidate: punctStripped, suffix } = stripTrailingPunctuation(match);
    if (!punctStripped) return match;

    const lineNumMatch = LINE_NUMBER_SUFFIX.exec(punctStripped);
    const rawCandidate = lineNumMatch ? punctStripped.slice(0, lineNumMatch.index) : punctStripped;
    const lineNumSuffix = lineNumMatch ? lineNumMatch[0] : '';
    if (!rawCandidate) return match;
    const tokenContext = getTokenContext(fullContent, offset, offset + rawCandidate.length);
    if (input.markdownLinksOnly === true && tokenContext.role !== 'markdown-link-dest')
      return match;
    const candidate = decodeLinkPath(rawCandidate, tokenContext.role);
    if (tokenContext.role !== 'markdown-link-dest' && WINDOWS_ABSOLUTE_PATH.test(candidate)) {
      return match;
    }
    const {
      translatedPath,
      resolvedBeforeTranslate: initialResolvedBeforeTranslate,
      matchedPath,
    } = resolveLinkTarget({
      candidate,
      rawToken: punctStripped,
      projectRoot: input.projectRoot,
      sourceFile: input.sourceFile,
      destinationFile: input.destinationFile,
      translatePath: input.translatePath,
      pathExists: input.pathExists,
    });
    let resolvedBeforeTranslate = initialResolvedBeforeTranslate;
    if (!matchedPath || !translatedPath) {
      if (translatedPath) missing.add(translatedPath);
      return match;
    }

    const normalizedCandidate = normalizeSeparators(candidate);
    const targetIsDirectory =
      candidate.endsWith('/') || input.pathIsDirectory?.(translatedPath) === true;
    if (
      targetIsDirectory &&
      !normalizedCandidate.includes('/') &&
      !normalizedCandidate.includes('\\')
    ) {
      // Bare folder names (e.g. `test`, `.agentsmesh`) should not be interpreted as links.
      // Keep handling for explicit path forms like `.agentsmesh/` or `/docs/`.
      return match;
    }
    // A slash command (`/plugin`, `/config`, `/memory`) is indistinguishable from
    // a one-segment root-absolute path, and resolution is existence-gated, so the
    // moment a repo grows a directory of that name every mention in prose would be
    // silently rewritten. Require a path to look like one: a further segment, an
    // extension, or a trailing slash.
    if (isSlashCommandToken(normalizedCandidate)) return match;

    if (resolvedBeforeTranslate === null) {
      let normTok = normalizeSeparators(punctStripped);
      if (normTok.startsWith('agentsmesh/')) {
        normTok = `.${normTok}`;
      }
      if (normTok.startsWith('.agentsmesh/') || normTok.includes('/.agentsmesh/')) {
        const api = pathApi(input.projectRoot);
        const root = normalizeForProject(input.projectRoot, input.projectRoot);
        const stripped = normTok.replace(/^\.\//, '');
        resolvedBeforeTranslate = normalizeForProject(input.projectRoot, api.join(root, stripped));
      }
    }

    const api = pathApi(input.projectRoot);

    if (input.scope === 'global') {
      const tokenFwd = normalizeSeparators(punctStripped);
      const tokenReferencesMesh =
        tokenFwd.startsWith('.agentsmesh/') || tokenFwd.includes('/.agentsmesh/');
      const tokenCanUseGlobalStandard =
        isRootRelativePathToken(tokenFwd) || isRelativePathToken(tokenFwd);
      const resolvedIsMesh =
        resolvedBeforeTranslate !== null &&
        isUnderAgentsMesh(input.projectRoot, resolvedBeforeTranslate);
      const translatedIsMesh = isUnderAgentsMesh(input.projectRoot, translatedPath);
      // No actual translation occurred — leave the link unchanged only when the resolved path
      // lives in the same top-level surface as the source file (e.g. both in .claude/).
      // This prevents cross-surface rebasing during import without suppressing project-root
      // normalization when generating from .agentsmesh/ to a tool file.
      const noTranslation = resolvedBeforeTranslate === translatedPath;
      if (noTranslation && !translatedIsMesh && !resolvedIsMesh && !tokenReferencesMesh) {
        const sourceFromRoot = normalizeSeparators(
          api.relative(input.projectRoot, normalizeForProject(input.projectRoot, input.sourceFile)),
        );
        const sourceTop = sourceFromRoot.split('/').filter(Boolean)[0] ?? '';
        const resolvedFromRoot =
          resolvedBeforeTranslate !== null
            ? normalizeSeparators(api.relative(input.projectRoot, resolvedBeforeTranslate))
            : '';
        const resolvedTop = resolvedFromRoot.split('/').filter(Boolean)[0] ?? '';
        if (sourceTop.length > 0 && sourceTop === resolvedTop) {
          return match;
        }
      }
      if (
        !tokenCanUseGlobalStandard &&
        !tokenReferencesMesh &&
        !resolvedIsMesh &&
        !translatedIsMesh
      ) {
        return match;
      }
    }
    const destAbsolute = normalizeForProject(input.projectRoot, input.destinationFile);
    const targetAbsolute = normalizeForProject(input.projectRoot, translatedPath);
    const destFromRoot = normalizeSeparators(api.relative(input.projectRoot, destAbsolute));
    const targetFromRoot = normalizeSeparators(api.relative(input.projectRoot, targetAbsolute));
    const destTop = destFromRoot.split('/').filter(Boolean)[0] ?? '';
    const targetTop = targetFromRoot.split('/').filter(Boolean)[0] ?? '';

    const tokenIsCanonicalMesh = normalizeSeparators(candidate).startsWith('.agentsmesh/');
    const preferRelativeProseInSameSurface =
      !tokenIsCanonicalMesh &&
      !targetIsDirectory &&
      destTop.length > 0 &&
      destTop === targetTop &&
      destTop.startsWith('.') &&
      destTop !== '.agentsmesh';

    const forceRelative =
      preferRelativeProseInSameSurface ||
      tokenContext.role === 'markdown-link-dest' ||
      isMarkdownLinkDestinationToken(fullContent, offset, rawCandidate);
    const rewritten = formatLinkPathForDestination(
      input.projectRoot,
      input.destinationFile,
      translatedPath,
      candidate.endsWith('/'),
      {
        explicitCurrentDirLinks: input.explicitCurrentDirLinks === true || forceRelative,
        scope: input.scope ?? 'project',
        pathIsDirectory: input.pathIsDirectory,
        logicalMeshSourceAbsolute: targetIsDirectory ? null : resolvedBeforeTranslate,
        forceRelative,
        tokenContext,
        originalToken: candidate,
      },
    );
    if (!rewritten) return match;
    return `${encodeLinkPath(rewritten, candidate !== rawCandidate)}${lineNumSuffix}${suffix}`;
  });

  return { content, missing: [...missing] };
}
