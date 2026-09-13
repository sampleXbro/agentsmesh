/**
 * Collision resolution for the shared root instruction file.
 *
 * `AGENTS.md` is read by many targets, so several of them generate the same
 * path. These helpers decide when two bodies are the same artifact, when one
 * genuinely supersedes the other, and when target-scoped rules have to be
 * combined because one file cannot differ per target.
 */

import type { GenerateResult } from '../types.js';
import { CODEX_CLI_TARGET_ID } from '../../targets/catalog/target-ids.js';
import { logger } from '../../utils/output/logger.js';

export const AGENTS_SUFFIX = 'AGENTS.md';

function trimmedContent(content: string): string {
  return content.trim();
}

/**
 * Strip optional decoration blocks that some targets embed in AGENTS.md while
 * others (e.g. cline) omit, then collapse the resulting whitespace. Two
 * AGENTS.md outputs that differ ONLY in these optional blocks are considered
 * semantically equivalent for collision purposes — the one that actually emits
 * the block wins as "richer".
 */
const OPTIONAL_AGENTS_BLOCKS: readonly RegExp[] = [
  /<!-- agentsmesh:embedded-rules:start -->[\s\S]*?<!-- agentsmesh:embedded-rules:end -->\n*/g,
];

function normalizeAgentsContent(content: string): string {
  let out = content;
  for (const block of OPTIONAL_AGENTS_BLOCKS) {
    out = out.replace(block, '');
  }
  return out.trim().replace(/\n{2,}/g, '\n\n');
}

function hasOptionalAgentsBlock(content: string): boolean {
  return /<!-- agentsmesh:embedded-rules:start -->/.test(content);
}

export function richerAgentsResult(left: GenerateResult, right: GenerateResult): GenerateResult | null {
  if (!left.path.endsWith(AGENTS_SUFFIX) || left.path !== right.path) return null;

  const leftTrimmed = trimmedContent(left.content);
  const rightTrimmed = trimmedContent(right.content);
  if (!leftTrimmed || !rightTrimmed) return null;

  const leftContainsRight = leftTrimmed.includes(rightTrimmed);
  const rightContainsLeft = rightTrimmed.includes(leftTrimmed);

  if (leftContainsRight !== rightContainsLeft) {
    return leftContainsRight ? left : right;
  }

  // R-7: contents that differ only in optional decoration blocks (e.g. amp
  // embeds non-root rules in AGENTS.md while cline emits them separately) are
  // semantically equivalent. Prefer the one that emits the optional block.
  if (normalizeAgentsContent(left.content) === normalizeAgentsContent(right.content)) {
    const leftHas = hasOptionalAgentsBlock(left.content);
    const rightHas = hasOptionalAgentsBlock(right.content);
    if (leftHas !== rightHas) return leftHas ? left : right;
  }

  return null;
}

function contentLines(content: string): Set<string> {
  const lines = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed !== '') lines.add(trimmed);
  }
  return lines;
}

/** Every line of `inner` also appears in `outer`. */
function covers(outer: ReadonlySet<string>, inner: ReadonlySet<string>): boolean {
  for (const line of inner) {
    if (!outer.has(line)) return false;
  }
  return true;
}

const EMBEDDED_RULES_BLOCK =
  /(<!-- agentsmesh:embedded-rules:start -->)([\s\S]*?)(<!-- agentsmesh:embedded-rules:end -->)/;
const EMBEDDED_RULE_UNIT =
  /<!-- agentsmesh:embedded-rule:start [\s\S]*?<!-- agentsmesh:embedded-rule:end -->/g;

function embeddedRuleUnits(block: string): string[] {
  return [...block.matchAll(EMBEDDED_RULE_UNIT)].map((m) => m[0]);
}

/**
 * Several targets write one shared root file, so a rule scoped with `targets:`
 * to just one of them still lands in a document every one of them reads. When
 * two bodies are identical outside the embedded-rules block, the difference is
 * exactly those scoped rules, and keeping one body meant silently dropping the
 * other target's rule. The union keeps every rule; a warning records that the
 * scoping could not be honoured, because one file cannot differ per target.
 */
export function mergedEmbeddedRulesResult(
  left: GenerateResult,
  right: GenerateResult,
): GenerateResult | null {
  if (!left.path.endsWith(AGENTS_SUFFIX) || left.path !== right.path) return null;
  if (normalizeAgentsContent(left.content) !== normalizeAgentsContent(right.content)) return null;

  const leftBlock = EMBEDDED_RULES_BLOCK.exec(left.content);
  const rightBlock = EMBEDDED_RULES_BLOCK.exec(right.content);
  if (!leftBlock?.[2] || !rightBlock?.[2]) return null;

  const leftUnits = embeddedRuleUnits(leftBlock[2]);
  const rightUnits = embeddedRuleUnits(rightBlock[2]);
  if (leftUnits.length === 0 && rightUnits.length === 0) return null;
  const added = rightUnits.filter((unit) => !leftUnits.includes(unit));
  if (added.length === 0) return left;

  const merged = [...leftUnits, ...added].join('\n\n');
  const content = left.content.replace(
    EMBEDDED_RULES_BLOCK,
    (_full, start: string, _inner: string, end: string) => `${start}\n\n${merged}\n\n${end}`,
  );
  logger.warn(
    `${left.path} is shared by ${left.target} and ${right.target}, so their target-scoped ` +
      'rules were combined into one file — every target reading it sees all of them.',
  );
  return { ...left, content };
}

export function richerCodexAgentsResult(
  left: GenerateResult,
  right: GenerateResult,
): GenerateResult | null {
  if (!left.path.endsWith(AGENTS_SUFFIX) || left.path !== right.path) return null;

  const codex =
    left.target === CODEX_CLI_TARGET_ID
      ? left
      : right.target === CODEX_CLI_TARGET_ID
        ? right
        : null;
  const other = codex === left ? right : left;
  if (!codex) return null;

  // Substance, not byte length. Comparing lengths meant that two bodies which
  // each carried content the other lacked still resolved — the longer one won
  // and the other target's rule was dropped with no message.
  const codexLines = contentLines(codex.content);
  const otherLines = contentLines(other.content);
  if (covers(codexLines, otherLines)) return codex;
  if (covers(otherLines, codexLines)) return other;
  return null;
}

