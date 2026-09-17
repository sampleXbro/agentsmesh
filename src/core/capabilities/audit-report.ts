import type { AuditReport } from './audit.js';
import type { CapabilityLedger } from './ledger-types.js';
import { CAPABILITY_FEATURES, CAPABILITY_SCOPES } from './ledger-types.js';

export function renderAuditReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('GAPS (descriptor < maxAchievable):');
  for (const g of report.gaps) {
    lines.push(
      `  ${g.target.padEnd(16)}${g.feature.padEnd(16)}${g.scope.padEnd(9)}${g.from}->${g.to}`,
    );
  }
  lines.push('STALE (needs verification):');
  for (const s of report.stale) {
    lines.push(`  ${s.target.padEnd(16)}${s.feature.padEnd(16)}${s.scope.padEnd(9)}${s.reason}`);
  }
  lines.push('MISSING PROVENANCE (native/embedded, no ledger entry):');
  for (const m of report.missing) {
    lines.push(`  ${m.target.padEnd(16)}${m.feature.padEnd(16)}${m.scope.padEnd(9)}${m.level}`);
  }
  lines.push('');
  lines.push(
    `${report.gaps.length} gaps · ${report.stale.length} stale · ${report.missing.length} missing`,
  );
  return lines.join('\n');
}

/** `--verify`: MISSING provenance for an advertised native/embedded cell is a hard failure. */
export function verifyLedgerCoverage(report: AuditReport): string[] {
  return report.missing.map(
    (m) => `no ledger provenance for ${m.target}/${m.feature} (${m.scope}, ${m.level})`,
  );
}

/**
 * Structural integrity of the ledger itself: every cell must reference a known
 * target/feature/scope and be unique. The loader casts feature/scope without
 * membership validation, so a typo'd manual edit would otherwise become a
 * silently-ignored orphan the audit never surfaces. This is a HARD invariant —
 * enforced by the conformance test, not a soft backlog like coverage.
 */
export function verifyLedgerIntegrity(
  ledger: CapabilityLedger,
  knownTargets: readonly string[],
): string[] {
  const targets = new Set(knownTargets);
  const features = new Set<string>(CAPABILITY_FEATURES);
  const scopes = new Set<string>(CAPABILITY_SCOPES);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const c of ledger.cells) {
    if (!targets.has(c.target))
      problems.push(`unknown target "${c.target}" (${c.feature}/${c.scope})`);
    if (!features.has(c.feature))
      problems.push(`unknown feature "${c.feature}" (${c.target}/${c.scope})`);
    if (!scopes.has(c.scope))
      problems.push(`unknown scope "${c.scope}" (${c.target}/${c.feature})`);
    const key = `${c.target}::${c.feature}::${c.scope}`;
    if (seen.has(key)) problems.push(`duplicate cell ${key}`);
    seen.add(key);
  }
  return problems;
}
