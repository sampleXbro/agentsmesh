import { statSync } from 'node:fs';
import type { GenerateResult } from '../types.js';
import { pathApi, normalizeForProject, stripTrailingPunctuation } from '../path-helpers.js';
import {
  LINE_NUMBER_SUFFIX,
  expandResolvedPaths,
  resolveProjectPath,
} from './link-rebaser-helpers.js';
import { inlineCodeRanges, protectedRanges } from './protected-ranges.js';
import { collectPlannedPaths } from './rewriter.js';
import { logger } from '../../utils/output/logger.js';

const INLINE_MD_LINK = /!?\[[^\]]*\]\(([^)]+)\)/g;
// `(?!\^)` keeps GFM footnote definitions (`[^1]: prose`) out: they share the
// reference-definition shape but their body is prose, not a destination.
const REF_LINK_DEF = /^\s*\[(?!\^)[^\]\n]+\]:\s*(?:<([^>\n]*)>|(\S+))/gm;

function isMarkdownLikeOutput(relativePath: string): boolean {
  return relativePath.endsWith('.md') || relativePath.endsWith('.mdc');
}

function isOffsetInRanges(
  offset: number,
  ranges: ReadonlyArray<readonly [number, number]>,
): boolean {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

/** Strip optional title and angle brackets from a markdown link destination. */
export function parseMarkdownLinkDestination(raw: string): string {
  let s = raw.trim();
  const withTitle = /^(.*?)\s+(["'])([\s\S]*?)\2\s*$/.exec(s);
  if (withTitle?.[1] !== undefined) s = withTitle[1].trim();
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1).trim();
  return s;
}

function shouldSkipLocalValidation(pathPart: string, projectRoot: string): boolean {
  const t = pathPart.trim();
  if (!t) return true;
  if (t.startsWith('#')) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^mailto:/i.test(t)) return true;
  if (/^data:/i.test(t)) return true;
  if (/^javascript:/i.test(t)) return true;
  if (/^ftp:/i.test(t)) return true;
  if (/^[a-zA-Z]:[\\/]/.test(t)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return true;
  // R-1: absolute-rooted paths that don't fall under the project tree are
  // URL paths (e.g. `/en/docs/agents-and-tools/...`), not filesystem refs.
  // Project-rooted absolutes (e.g. `/proj/.agentsmesh/...`) keep going so the
  // existing strict check for misformed in-project absolutes still applies.
  if (t.startsWith('/')) {
    const normalizedRoot = normalizeForProject(projectRoot, projectRoot);
    const normalizedAbs = normalizeForProject(projectRoot, t);
    if (!normalizedAbs.startsWith(`${normalizedRoot}/`) && normalizedAbs !== normalizedRoot) {
      return true;
    }
  }
  return false;
}

/**
 * R-4: a generated output that lives under `<tool-dir>/skills/<name>/...` is
 * third-party skill content (materialized from an install pack). Broken
 * sibling-reference links inside that subtree are advisory warnings, not
 * generate-blocking errors — the consumer has no way to fix upstream content.
 */
function isSkillGeneratedOutput(relativePath: string): boolean {
  return /(?:^|\/)[^/]+\/skills\/[^/]+\//.test(relativePath);
}

/**
 * Extract a canonical `<feature>/<name>` key from a generated output path.
 * Returns null when the path doesn't match `<tool-dir>/<feature-dir>/<name>...`.
 *
 * Recognized feature directories (per-target naming variation):
 *   - rules     ← `.<tool>/rules`, `.cursor/rules` (`.mdc`), `.kiro/steering`
 *   - commands  ← `.<tool>/commands`
 *   - agents    ← `.<tool>/agents`
 *   - skills    ← `.<tool>/skills/<name>/...`
 *
 * Examples:
 *   `.claude/rules/code-review.md`         → `rules/code-review`
 *   `.cursor/rules/typescript.mdc`         → `rules/typescript`
 *   `.kiro/steering/code-review.md`        → `rules/code-review`
 *   `.cursor/agents/reviewer.md`           → `agents/reviewer`
 *   `.claude/commands/foo.md`              → `commands/foo`
 *   `.claude/skills/foo/SKILL.md`          → `skills/foo`
 *   `.claude/skills/foo/references/x.md`   → `skills/foo`
 */
const OUTPUT_DIR_TO_FEATURE: Record<string, string> = {
  rules: 'rules',
  steering: 'rules',
  commands: 'commands',
  agents: 'agents',
  skills: 'skills',
  // factory-droid: native agent definitions land in `.factory/droids/<name>.md`.
  // Treat the directory as the agents feature so pack-originated key matching
  // recognizes those outputs and downgrades broken links to advisory warnings.
  droids: 'agents',
  // copilot project layout: rules emit per-glob into `.github/instructions/`,
  // commands into `.github/prompts/`. Map both to their canonical features so
  // pack-originated outputs from those dirs match the same keys as their
  // canonical counterparts.
  instructions: 'rules',
  prompts: 'commands',
};

/**
 * Target-specific top-level rule dirs that are themselves the "rules" output
 * (no per-feature subdirectory, i.e. `<top-level-dir>/<name>.md` with no
 * middle feature segment). Each entry maps the leading directory of the
 * generated output path to a canonical feature.
 *
 * No target currently needs this (Cline's rules now live at
 * `.cline/rules/<name>.md`, a 3-segment path already matched by
 * `OUTPUT_DIR_TO_FEATURE` above) — kept as an extension point.
 */
const TOP_LEVEL_DIR_TO_FEATURE: Record<string, string> = {};

/**
 * Target-specific double-extensions that wrap a canonical entity name.
 * Copilot agents emit as `<name>.agent.md`, rules as `<name>.instructions.md`,
 * commands as `<name>.prompt.md`. Strip the suffix before keying so the result
 * matches the canonical `<feature>/<name>` form used in pack-originated key sets.
 */
const COMPOUND_MARKDOWN_SUFFIXES = ['.agent.md', '.instructions.md', '.prompt.md'] as const;

function stripMarkdownExt(name: string): string {
  for (const suffix of COMPOUND_MARKDOWN_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  if (name.endsWith('.mdc')) return name.slice(0, -4);
  if (name.endsWith('.md')) return name.slice(0, -3);
  return name;
}

function canonicalKeyFromOutputPath(relativePath: string): string | null {
  // <tool-dir>/<feature-dir>/<name>...
  const m = /^[^/]+\/([^/]+)\/([^/]+)/.exec(relativePath);
  if (m) {
    const feature = OUTPUT_DIR_TO_FEATURE[m[1] ?? ''];
    if (feature) {
      let name = m[2] ?? '';
      if (feature !== 'skills') name = stripMarkdownExt(name);
      return `${feature}/${name}`;
    }
  }
  // <top-level-rule-dir>/<name>... (e.g. .clinerules/<name>.md)
  const m2 = /^([^/]+)\/([^/]+)/.exec(relativePath);
  if (m2) {
    const feature = TOP_LEVEL_DIR_TO_FEATURE[m2[1] ?? ''];
    if (feature) {
      return `${feature}/${stripMarkdownExt(m2[2] ?? '')}`;
    }
  }
  return null;
}

function pathExistsForGenerate(absolutePath: string, planned: ReadonlySet<string>): boolean {
  if (planned.has(absolutePath)) return true;
  try {
    const st = statSync(absolutePath);
    return st.isFile() || st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolves a markdown link target to absolute paths to check (same strategy as link rewriting).
 */
export function resolveMarkdownLinkTargets(
  rawDestination: string,
  projectRoot: string,
  destinationFileAbs: string,
): string[] {
  const parsed = parseMarkdownLinkDestination(rawDestination);
  const pathWithPossibleHash = parsed.split('#')[0] ?? '';
  const { candidate: punctStripped } = stripTrailingPunctuation(pathWithPossibleHash);
  let pathPart = punctStripped;
  const lineMatch = LINE_NUMBER_SUFFIX.exec(pathPart);
  if (lineMatch) pathPart = pathPart.slice(0, lineMatch.index);

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }

  if (shouldSkipLocalValidation(decoded, projectRoot)) return [];

  let candidates = resolveProjectPath(decoded, projectRoot, destinationFileAbs);
  if (candidates.length === 0) {
    const api = pathApi(projectRoot);
    const normalizedDest = normalizeForProject(projectRoot, destinationFileAbs);
    candidates = [
      normalizeForProject(projectRoot, api.join(api.dirname(normalizedDest), decoded)),
      normalizeForProject(projectRoot, api.join(projectRoot, decoded)),
    ];
  }

  const expanded: string[] = [];
  for (const c of candidates) {
    for (const e of expandResolvedPaths(projectRoot, c)) {
      const n = normalizeForProject(projectRoot, e);
      if (!expanded.includes(n)) expanded.push(n);
    }
  }
  return expanded;
}

export interface BrokenMarkdownLink {
  generatePath: string;
  target: string;
  rawLink: string;
  checkedPaths: string[];
}

export function findBrokenMarkdownLinks(
  results: GenerateResult[],
  projectRoot: string,
): BrokenMarkdownLink[] {
  const planned = collectPlannedPaths(projectRoot, results);
  const broken: BrokenMarkdownLink[] = [];

  for (const result of results) {
    if (!isMarkdownLikeOutput(result.path)) continue;
    const destinationAbs = normalizeForProject(
      projectRoot,
      pathApi(projectRoot).join(projectRoot, result.path),
    );
    // Inline code spans count as protected here but not in the rewriter: a rule
    // that documents link syntax in backticks is prose, not a broken link.
    const protectedR = [...protectedRanges(result.content), ...inlineCodeRanges(result.content)];

    const visitDestination = (raw: string, matchIndex: number): void => {
      if (isOffsetInRanges(matchIndex, protectedR)) return;
      const checked = resolveMarkdownLinkTargets(raw, projectRoot, destinationAbs);
      if (checked.length === 0) return;
      if (checked.some((p) => pathExistsForGenerate(p, planned))) return;
      broken.push({
        generatePath: result.path,
        target: result.target,
        rawLink: raw.trim(),
        checkedPaths: checked,
      });
    };

    for (const match of result.content.matchAll(INLINE_MD_LINK)) {
      const inner = match[1];
      if (inner === undefined) continue;
      visitDestination(inner, match.index ?? 0);
    }

    for (const ref of result.content.matchAll(REF_LINK_DEF)) {
      const url = (ref[1] ?? ref[2] ?? '').trim();
      if (!url) continue;
      visitDestination(url, ref.index ?? 0);
    }
  }

  return broken;
}

/**
 * Ensures inline/reference markdown links in generated `.md`/`.mdc` outputs resolve to real files
 * or directories (or another path in the same generate batch). Remote URLs are ignored.
 */
export function validateGeneratedMarkdownLinks(
  results: GenerateResult[],
  projectRoot: string,
  options: { packOriginatedKeys?: ReadonlySet<string> } = {},
): void {
  const broken = findBrokenMarkdownLinks(results, projectRoot);
  if (broken.length === 0) return;

  const packKeys = options.packOriginatedKeys;
  const errors: BrokenMarkdownLink[] = [];
  const warnings: BrokenMarkdownLink[] = [];
  for (const b of broken) {
    const key = canonicalKeyFromOutputPath(b.generatePath);
    const isPackOriginated = packKeys !== undefined && key !== null && packKeys.has(key);
    if (isSkillGeneratedOutput(b.generatePath) || isPackOriginated) {
      warnings.push(b);
    } else {
      errors.push(b);
    }
  }

  if (warnings.length > 0) {
    const lines = warnings.map(
      (b) => `  ${b.generatePath} (${b.target}): "${b.rawLink}" → not found`,
    );
    logger.warn(
      `Third-party content contains ${warnings.length} broken local link${warnings.length === 1 ? '' : 's'} (warning only; ` +
        `outputs from installed packs and skill subtrees are treated as advisory):\n${lines.join('\n')}`,
    );
  }

  if (errors.length === 0) return;

  const lines = errors.map(
    (b) =>
      `  ${b.generatePath} (${b.target}): "${b.rawLink}" → not found (tried: ${b.checkedPaths.join(', ')})`,
  );
  throw new Error(
    `Generated markdown contains broken local links:\n${lines.join('\n')}\n` +
      'Fix canonical sources or generators so every local link targets an existing file or folder.',
  );
}
