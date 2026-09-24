/**
 * One embedded rule entry: a start marker carrying the rule's canonical source
 * and metadata, its body, and an end marker. Entries sit inside the protected
 * embedded-rules block of a root file, or bare in a nested `<dir>/AGENTS.md`,
 * where their links are still rewritten and import restores each rule to its
 * own canonical file (#140).
 */

import { basename, join } from 'node:path';
import type { CanonicalRule } from '../../core/types.js';

export const EMBEDDED_RULE_END = '<!-- agentsmesh:embedded-rule:end -->';
const START_PREFIX = '<!-- agentsmesh:embedded-rule:start ';
const START_SUFFIX = ' -->';

interface EmbeddedRuleMarker {
  source: string;
  description: string;
  globs: string[];
  targets: string[];
}

export interface ExtractedEmbeddedRule extends EmbeddedRuleMarker {
  body: string;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleSource(source: string): string {
  const normalized = source.replace(/\\/g, '/');
  const meshIndex = normalized.lastIndexOf('.agentsmesh/');
  if (meshIndex >= 0) return normalized.slice(meshIndex + '.agentsmesh/'.length);
  if (normalized.startsWith('rules/')) return normalized;
  return join('rules', basename(normalized)).replace(/\\/g, '/');
}

export function renderEmbeddedRule(rule: CanonicalRule): string {
  const marker: EmbeddedRuleMarker = {
    source: ruleSource(rule.source),
    description: rule.description,
    globs: rule.globs,
    targets: rule.targets,
  };
  const parts = [`${START_PREFIX}${JSON.stringify(marker)}${START_SUFFIX}`];
  if (rule.description.trim()) {
    parts.push(`## ${rule.description.trim()}`, '');
  }
  parts.push(rule.body.trim(), EMBEDDED_RULE_END);
  return parts.filter((part) => part.length > 0).join('\n');
}

/** Bare entries for a nested `<dir>/AGENTS.md`, one after another. */
export function renderEmbeddedRuleEntries(rules: readonly CanonicalRule[]): string {
  return rules.map(renderEmbeddedRule).join('\n\n');
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function parseMarker(value: string): EmbeddedRuleMarker | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.source !== 'string' || !record.source.startsWith('rules/')) return null;
    return {
      source: record.source,
      description: typeof record.description === 'string' ? record.description : '',
      globs: toStringArray(record.globs),
      targets: toStringArray(record.targets),
    };
  } catch {
    return null;
  }
}

function stripGeneratedHeading(body: string, description: string): string {
  const trimmed = body.trim();
  if (!description.trim()) return trimmed;
  const heading = `## ${description.trim()}`;
  return trimmed.startsWith(heading) ? trimmed.slice(heading.length).trim() : trimmed;
}

/**
 * Take every entry out of `text`: returns the rules and the trimmed text left.
 * An entry whose marker cannot be read is left in place.
 */
export function takeEmbeddedRuleEntries(text: string): {
  rest: string;
  rules: ExtractedEmbeddedRule[];
} {
  const rules: ExtractedEmbeddedRule[] = [];
  const entry = new RegExp(
    `${escapeRegExp(START_PREFIX)}([\\s\\S]*?)${escapeRegExp(START_SUFFIX)}([\\s\\S]*?)${escapeRegExp(EMBEDDED_RULE_END)}`,
    'g',
  );
  const rest = text.replace(entry, (whole: string, markerText: string, body: string) => {
    const marker = parseMarker(markerText);
    if (!marker) return whole;
    rules.push({ ...marker, body: stripGeneratedHeading(body, marker.description) });
    return '';
  });
  return { rest: rest.trim(), rules };
}
