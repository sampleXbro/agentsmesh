import { isRecord } from '../../utils/types/guards.js';
import { parse as parseYaml } from 'yaml';
import { parse as parseToml } from 'smol-toml';
import type { Fingerprint, KeyCheck, LedgerCell, LedgerFormat } from './ledger-types.js';

export function parseByFormat(raw: string, format: LedgerFormat): unknown {
  if (format === 'json') return JSON.parse(raw);
  if (format === 'toml') return parseToml(raw);
  if (format === 'yaml') return parseYaml(raw);
  if (format === 'text') return raw;
  // md-frontmatter: parse the leading `---` block, else empty object.
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) return parseYaml(raw.slice(3, end)) ?? {};
  }
  return {};
}

function kindOf(value: unknown): KeyCheck['kind'] | 'null' {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'object') return 'object';
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'null';
}

/** Resolve a `/a/b` or `/a/*` pointer to the set of values it addresses. */
function resolvePointer(root: unknown, pointer: string): unknown[] {
  const segments = pointer.split('/').filter((s) => s.length > 0);
  let current: unknown[] = [root];
  for (const seg of segments) {
    const next: unknown[] = [];
    for (const node of current) {
      if (seg === '*') {
        if (Array.isArray(node)) next.push(...node);
        else if (isRecord(node)) next.push(...Object.values(node));
      } else if (isRecord(node) && seg in node) {
        next.push(node[seg]);
      }
    }
    current = next;
  }
  return current;
}

function checkKey(root: unknown, check: KeyCheck): string[] {
  const values = resolvePointer(root, check.pointer);
  if (values.length === 0) return [`pointer "${check.pointer}" resolved to nothing`];
  const issues: string[] = [];
  for (const value of values) {
    if (kindOf(value) !== check.kind) {
      issues.push(`"${check.pointer}" expected ${check.kind}, got ${kindOf(value)}`);
      continue;
    }
    if (check.anyOf !== undefined && isRecord(value)) {
      if (!check.anyOf.some((k) => k in value)) {
        issues.push(`"${check.pointer}" must have one of [${check.anyOf.join(', ')}]`);
      }
    }
  }
  return issues;
}

export function checkConformance(cell: LedgerCell, actualExt: string, raw: string): string[] {
  if (actualExt !== cell.ext) {
    return [`extension mismatch: expected "${cell.ext}", got "${actualExt}"`];
  }
  // text format: path/ext-only conformance — no structural parsing.
  if (cell.format === 'text') return [];
  let parsed: unknown;
  try {
    parsed = parseByFormat(raw, cell.format);
  } catch (err) {
    return [`failed to parse as ${cell.format}: ${(err as Error).message}`];
  }
  const issues: string[] = [];
  for (const key of cell.fingerprint.topLevelKeys) {
    if (!isRecord(parsed) || !(key in parsed)) issues.push(`missing top-level key "${key}"`);
  }
  for (const field of cell.fingerprint.requiredFrontmatter) {
    if (!isRecord(parsed) || !(field in parsed))
      issues.push(`missing frontmatter field "${field}"`);
  }
  for (const check of cell.fingerprint.keyChecks) {
    issues.push(...checkKey(parsed, check));
  }
  return issues;
}

export function deriveFingerprint(parsed: unknown, _format: LedgerFormat): Fingerprint {
  const topLevelKeys = isRecord(parsed) ? Object.keys(parsed) : [];
  return { topLevelKeys, requiredFrontmatter: [], keyChecks: [] };
}
