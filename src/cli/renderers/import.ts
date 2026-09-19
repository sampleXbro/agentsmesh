/**
 * Human-readable renderer for import command output.
 */

import { ui } from '../ui/ui.js';
import type { ImportCommandResult } from '../commands/import.js';

export function renderImport(result: ImportCommandResult): void {
  const { data } = result;

  if (data.files.length === 0) {
    ui.info(`Nothing to import from ${data.target}.`);
    return;
  }

  for (const f of data.files) {
    ui.success(`${f.from} → ${f.to}`);
  }
  if (data.rootRuleMerged) {
    ui.info(
      `Root rule merged into .agentsmesh/rules/_root.md — it already held another tool's rules, so both are kept. Review and edit it if they overlap.`,
    );
  }
  const scopeFlag = data.scope === 'global' ? ' --global' : '';
  ui.info(
    `Imported ${data.files.length} file(s). Run 'agentsmesh generate${scopeFlag}' to sync to other tools.`,
  );
}
