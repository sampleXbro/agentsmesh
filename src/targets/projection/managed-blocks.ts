import { splitFrontmatter } from '../../utils/text/markdown.js';
import type { CanonicalRule, CanonicalFiles } from '../../core/types.js';
import {
  escapeRegExp,
  renderEmbeddedRule,
  takeEmbeddedRuleEntries,
  type ExtractedEmbeddedRule,
} from './embedded-rule-entries.js';

export { EMBEDDED_RULE_END, type ExtractedEmbeddedRule } from './embedded-rule-entries.js';

export const ROOT_CONTRACT_START = '<!-- agentsmesh:root-generation-contract:start -->';
export const ROOT_CONTRACT_END = '<!-- agentsmesh:root-generation-contract:end -->';
export const LESSONS_CONTRACT_START = '<!-- agentsmesh:lessons-contract:start -->';
export const LESSONS_CONTRACT_END = '<!-- agentsmesh:lessons-contract:end -->';
export const EMBEDDED_RULES_START = '<!-- agentsmesh:embedded-rules:start -->';
export const EMBEDDED_RULES_END = '<!-- agentsmesh:embedded-rules:end -->';

export interface ExtractedEmbeddedRules {
  rootContent: string;
  rules: ExtractedEmbeddedRule[];
}

function managedBlockPattern(start: string, end: string): RegExp {
  return new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'g');
}

export function replaceManagedBlock(
  content: string,
  start: string,
  end: string,
  block: string,
): string {
  const pattern = managedBlockPattern(start, end);
  if (pattern.test(content)) {
    return content.replace(pattern, block).trim();
  }
  const trimmed = content.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function stripManagedBlock(content: string, start: string, end: string): string {
  return content.replace(managedBlockPattern(start, end), '').trim();
}

/**
 * Split a leading `---…---` frontmatter block from the body without parsing the
 * YAML, so the prefix can be re-emitted byte-for-byte. Returns an empty prefix
 * when there is no frontmatter.
 */
function splitFrontmatterPrefix(content: string): { prefix: string; body: string } {
  const split = splitFrontmatter(content);
  return split === null
    ? { prefix: '', body: content.trim() }
    : { prefix: split.prefix, body: split.body };
}

/**
 * Place `block` at the top of the document body, keeping any leading
 * frontmatter first. Used to inject the generation-contract and lessons blocks
 * at the beginning of a target's primary root instruction rather than the end.
 */
export function insertAtBodyTop(content: string, block: string): string {
  const { prefix, body } = splitFrontmatterPrefix(content);
  const placed = body ? `${block}\n\n${body}` : block;
  return prefix ? `${prefix}\n\n${placed}` : placed;
}

export function renderEmbeddedRulesBlock(rules: readonly CanonicalRule[]): string {
  if (rules.length === 0) return '';
  return [EMBEDDED_RULES_START, ...rules.map(renderEmbeddedRule), EMBEDDED_RULES_END].join('\n');
}

export function appendEmbeddedRulesBlock(content: string, rules: readonly CanonicalRule[]): string {
  const block = renderEmbeddedRulesBlock(rules);
  const withoutExisting = stripManagedBlock(content, EMBEDDED_RULES_START, EMBEDDED_RULES_END);
  if (!block) return withoutExisting;
  return withoutExisting ? `${withoutExisting}\n\n${block}` : block;
}

export function extractEmbeddedRules(content: string): ExtractedEmbeddedRules {
  const rules: ExtractedEmbeddedRule[] = [];
  const outerPattern = managedBlockPattern(EMBEDDED_RULES_START, EMBEDDED_RULES_END);
  const rootContent = content.replace(outerPattern, (block) => {
    const inner = block.replace(EMBEDDED_RULES_START, '').replace(EMBEDDED_RULES_END, '');
    rules.push(...takeEmbeddedRuleEntries(inner).rules);
    return '';
  });
  return { rootContent: rootContent.trim(), rules };
}

/**
 * The embedded-root-rule generator: the root rule's body plus a managed block
 * holding every non-root rule that targets `target`, written to `rootFile`.
 * Targets with no native per-rule file all project rules this way.
 */
export function embeddedRootRule(
  canonical: CanonicalFiles,
  target: string,
  rootFile: string,
): { path: string; content: string }[] {
  const rootBody = canonical.rules.find((rule) => rule.root)?.body.trim() ?? '';
  const nonRootRules = canonical.rules.filter(
    (rule) => !rule.root && (rule.targets.length === 0 || rule.targets.includes(target)),
  );
  const content = appendEmbeddedRulesBlock(rootBody, nonRootRules);
  return content ? [{ path: rootFile, content }] : [];
}
