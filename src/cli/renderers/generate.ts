/**
 * Human-readable renderer for generate command output.
 */

import { ui } from '../ui/ui.js';
import type { GenerateCommandResult } from '../commands/generate.js';
import type { GenerateData } from '../command-result.js';

/**
 * Format a generated-output path for user-facing log lines.
 * In global mode the path is resolved against the user home directory, not the
 * project root — prefix with `~/` so users don't misread a log line like
 * `✓ updated .claude/settings.json` as a project-local write.
 */
function formatDisplayPath(scope: 'project' | 'global', relPath: string): string {
  return scope === 'global' ? `~/${relPath}` : relPath;
}

const KEPT_BECAUSE: Record<NonNullable<GenerateData['kept']>[number]['reason'], string> = {
  edited:
    'you edited it, and no target generates it now. Delete it yourself if you do not need it.',
  shared:
    'it is a shared tool config and no target generates it now. Remove the agentsmesh entries yourself if you do not need them.',
};

/** The warning for one file a run left on disk; the MCP generate tool reuses it. */
export function keptWarning(
  scope: 'project' | 'global',
  { path, reason }: NonNullable<GenerateData['kept']>[number],
): string {
  return `Kept ${formatDisplayPath(scope, path)}: ${KEPT_BECAUSE[reason]}`;
}

function renderKept(data: GenerateData): void {
  for (const kept of data.kept ?? []) ui.warn(keptWarning(data.scope, kept));
}

function renderCheck(data: GenerateData): void {
  const { scope, files } = data;
  const drifted = files.filter((f) => f.status !== 'unchanged');
  const stale = data.removed ?? [];
  for (const f of drifted) {
    ui.error(`[check] ${f.status} ${formatDisplayPath(scope, f.path)} (${f.target})`);
  }
  for (const path of stale) ui.error(`[check] stale ${formatDisplayPath(scope, path)}`);
  renderKept(data);
  if (drifted.length === 0 && stale.length === 0) {
    ui.success('Generated files are in sync.');
    return;
  }
  const fix = drifted.length > 0 ? 'update' : 'remove';
  ui.error(`Generated files are out of sync. Run 'agentsmesh generate' to ${fix} them.`);
}

function renderDryRun(data: GenerateData): void {
  for (const f of data.files) {
    ui.info(`[dry-run] ${f.status} ${formatDisplayPath(data.scope, f.path)} (${f.target})`);
  }
  for (const path of data.removed ?? []) {
    ui.info(`[dry-run] removed ${formatDisplayPath(data.scope, path)}`);
  }
  renderKept(data);
}

function renderGenerated(data: GenerateData): void {
  const { scope, files } = data;
  const removed = data.removed ?? [];
  for (const f of files) {
    if (f.status === 'created' || f.status === 'updated') {
      ui.success(`${f.status} ${formatDisplayPath(scope, f.path)}`);
    }
  }
  for (const path of removed) ui.success(`removed ${formatDisplayPath(scope, path)}`);
  renderKept(data);
  if (files.length === 0 && removed.length === 0) return;

  const { created, updated, unchanged } = data.summary;
  if (created > 0 || updated > 0 || removed.length > 0) {
    const counts = [`${created} created`, `${updated} updated`];
    if (removed.length > 0) counts.push(`${removed.length} removed`);
    counts.push(`${unchanged} unchanged`);
    ui.note(counts.join(' · '), 'Generated');
    ui.info(`Generated: ${counts.join(', ')}`);
  } else {
    ui.info(`Nothing changed. (${unchanged} unchanged)`);
  }
}

export function renderGenerate(result: GenerateCommandResult): void {
  const { data } = result;
  if (data.files.length === 0) {
    if (data.emptyReason === 'no-global-support') {
      ui.info('No files to generate (target has no global mode — try without --global).');
    } else {
      ui.info('No files to generate (no root rule or rules feature disabled).');
    }
  }
  if (data.mode === 'check') renderCheck(data);
  else if (data.mode === 'dry-run') renderDryRun(data);
  else renderGenerated(data);
}
