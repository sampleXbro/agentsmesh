/**
 * Human-readable renderer for check command output.
 */

import { ui } from '../ui/ui.js';
import type { CheckCommandResult } from '../commands/check.js';

export function renderCheck(result: CheckCommandResult): void {
  const { data } = result;
  if (result.error !== undefined) ui.error(result.error);

  if (!data.hasLock) {
    ui.error("Not initialized for collaboration. Run 'agentsmesh generate' first.");
    return;
  }

  if (data.inSync) {
    ui.note('Lock file is in sync.', 'Check');
    ui.success('Lock file is in sync.');
    renderUntracked(data);
    renderSkippedNote(data);
    return;
  }

  const lockedSet = new Set(data.lockedViolations);
  ui.error('Conflict detected:');
  for (const p of data.extendsModified) {
    ui.error(`  extend "${p}" was modified`);
  }
  for (const p of data.modified) {
    const suffix = lockedSet.has(p) ? ' [LOCKED]' : '';
    ui.error(`  ${p} was modified${suffix}`);
  }
  for (const p of data.added) {
    const suffix = lockedSet.has(p) ? ' [LOCKED]' : '';
    ui.error(`  ${p} was added${suffix}`);
  }
  for (const p of data.removed) {
    const suffix = lockedSet.has(p) ? ' [LOCKED]' : '';
    ui.error(`  ${p} was removed${suffix}`);
  }
  for (const p of data.outputsModified) {
    ui.error(`  generated output "${fwd(p)}" was modified`);
  }
  for (const p of data.outputsRemoved) {
    ui.error(`  generated output "${fwd(p)}" was removed`);
  }
  for (const p of data.outputsStale) {
    ui.error(`  generated output "${fwd(p)}" is stale`);
  }
  ui.note('Generated files are out of sync.', 'Check');
  ui.info(
    "Run 'agentsmesh merge' to resolve, or 'agentsmesh generate --force' to accept current state.",
  );
  renderUntracked(data);
  renderSkippedNote(data);
}

/**
 * Files inside a managed directory agentsmesh did not generate. Informational
 * only — they never affect the exit code, because `generate` cannot remove them
 * and reporting them as drift would be a red gate with no remedy.
 */
function renderUntracked(data: CheckCommandResult['data']): void {
  if (data.outputsUntracked.length === 0) return;
  ui.info(
    `${data.outputsUntracked.length} file(s) in managed directories were not written by agentsmesh (left untouched):`,
  );
  for (const p of data.outputsUntracked) ui.info(`  ${fwd(p)}`);
}

/** Normalize a displayed path to forward slashes (CLI paths rule). */
function fwd(p: string): string {
  return p.replaceAll('\\', '/');
}

/**
 * When a lock exists but output verification did not run — an old-format lock
 * without an `outputs` map, or `--no-outputs` — tell the user hand-edits to
 * generated files went unchecked and how to enable the check.
 */
function renderSkippedNote(data: CheckCommandResult['data']): void {
  if (!data.hasLock || data.outputsChecked) return;
  ui.info(
    "Generated-output verification skipped; run 'agentsmesh generate' to refresh the lock and enable it.",
  );
}
