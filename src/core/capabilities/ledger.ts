import { isRecord } from '../../utils/types/guards.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CapabilityFeatureKey } from '../../targets/catalog/capabilities.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';
import type { SupportLevel } from '../result-types.js';
import type {
  CapabilityLedger,
  Fingerprint,
  LedgerCell,
  LedgerFormat,
  LedgerVerdict,
} from './ledger-types.js';

const DEFAULT_LEDGER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../targets/catalog/capability-ledger.json',
);

const LEVELS: readonly SupportLevel[] = ['native', 'embedded', 'partial', 'none'];
const FORMATS: readonly LedgerFormat[] = ['json', 'yaml', 'toml', 'md-frontmatter', 'text'];
const VERDICTS: readonly LedgerVerdict[] = ['confirmed', 'rejected', 'unverified'];

function requireString(obj: Record<string, unknown>, key: string, at: string): string {
  const value = obj[key];
  if (typeof value !== 'string') throw new Error(`${at}: field "${key}" must be a string`);
  return value;
}

function requireStringArray(obj: Record<string, unknown>, key: string, at: string): string[] {
  const value = obj[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${at}: field "${key}" must be a string[]`);
  }
  return value as string[];
}

function assertFingerprint(value: unknown, at: string): Fingerprint {
  if (!isRecord(value)) throw new Error(`${at}: fingerprint must be an object`);
  return {
    topLevelKeys: requireStringArray(value, 'topLevelKeys', at),
    requiredFrontmatter: requireStringArray(value, 'requiredFrontmatter', at),
    keyChecks: Array.isArray(value.keyChecks) ? (value.keyChecks as Fingerprint['keyChecks']) : [],
  };
}

function assertCell(value: unknown, index: number): LedgerCell {
  const at = `cell[${index}]`;
  if (!isRecord(value)) throw new Error(`${at}: must be an object`);
  const maxAchievable = requireString(value, 'maxAchievable', at) as SupportLevel;
  const format = requireString(value, 'format', at) as LedgerFormat;
  const verdict = requireString(value, 'verdict', at) as LedgerVerdict;
  if (!LEVELS.includes(maxAchievable)) throw new Error(`${at}: bad maxAchievable`);
  if (!FORMATS.includes(format)) throw new Error(`${at}: bad format`);
  if (!VERDICTS.includes(verdict)) throw new Error(`${at}: bad verdict`);
  const verifiedAtRaw = value.verifiedAt;
  if (verifiedAtRaw !== null && typeof verifiedAtRaw !== 'string') {
    throw new Error(`${at}: verifiedAt must be an ISO string or null`);
  }
  const rejectionRaw = value.rejectionReason;
  if (rejectionRaw !== null && typeof rejectionRaw !== 'string') {
    throw new Error(`${at}: rejectionReason must be a string or null`);
  }
  return {
    target: requireString(value, 'target', at),
    feature: requireString(value, 'feature', at) as CapabilityFeatureKey,
    scope: requireString(value, 'scope', at) as TargetLayoutScope,
    maxAchievable,
    path: requireString(value, 'path', at),
    ext: requireString(value, 'ext', at),
    format,
    fingerprint: assertFingerprint(value.fingerprint, at),
    source: requireStringArray(value, 'source', at),
    verifiedAt: verifiedAtRaw,
    verdict,
    rejectionReason: rejectionRaw,
  };
}

export function parseCapabilityLedger(raw: string): CapabilityLedger {
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || !Array.isArray(data.cells)) {
    throw new Error('capability-ledger.json: expected { cells: [...] }');
  }
  return { cells: data.cells.map(assertCell) };
}

export function loadCapabilityLedger(overridePath?: string): CapabilityLedger {
  return parseCapabilityLedger(readFileSync(overridePath ?? DEFAULT_LEDGER_PATH, 'utf-8'));
}
