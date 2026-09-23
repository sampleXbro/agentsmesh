/**
 * Human-readable renderer for init command output.
 */

import { relative } from 'node:path';
import { mergeDriverSetupLine, type MergeDriverSetup } from '../../lessons/merge-driver-setup.js';
import { logger } from '../../utils/output/logger.js';
import type { InitCommandResult } from '../commands/init.js';

export function renderInit(result: InitCommandResult): void {
  const { data } = result;

  // Lessons-only retrofit (`init --lessons` on an already-initialized project).
  if (data.lessonsOnly === true && data.lessons !== undefined) {
    renderLessons(data.lessons);
    logger.info(`Run 'agentsmesh generate' to project the new lessons rule to every target.`);
    return;
  }

  if (data.detectedConfigs.length > 0) {
    logger.info(`Found existing configurations: ${data.detectedConfigs.join(', ')}`);
  }

  if (data.detectedConfigs.length > 0 && data.imported.length === 0) {
    logger.info(
      `Run 'agentsmesh init --yes' to auto-import, or 'agentsmesh import --from <tool>' manually.`,
    );
  }

  if (data.imported.length > 0) {
    logger.info('Auto-importing existing configurations (--yes)...');
    for (const f of data.imported) {
      logger.success(`  ${f.from} → ${f.to}`);
    }
    logger.info(`Imported ${data.imported.length} file(s) from ${data.importedToolCount} tool(s).`);
    if (data.rootRuleMerged) {
      logger.info(
        `  More than one tool had a root rule — all of them were merged into .agentsmesh/rules/_root.md. Review it before running 'agentsmesh generate'.`,
      );
    }
  }

  const targetsSuffix =
    data.imported.length > 0 && data.detectedConfigs.length > 0
      ? ` (targets: ${data.detectedConfigs.join(', ')})`
      : '';
  logger.success(`Created ${data.configFile}${targetsSuffix}`);
  renderTargetChoice(data);
  logger.success(`Created ${data.localConfigFile}`);

  if (data.gitignoreUpdated) {
    logger.success('Updated .gitignore');
  }

  if (data.lessons !== undefined) {
    renderLessons(data.lessons);
  }
}

/**
 * Say how many targets were enabled and why, so a default the user did not pick
 * is never silent — and always name the flag that changes it.
 */
function renderTargetChoice(data: InitCommandResult['data']): void {
  // 'explicit' and 'all' both mean the user named what they wanted.
  const chosen = data.targetSource === 'explicit' || data.targetSource === 'all';
  if (chosen || data.targets.length === 0) return;
  const count = data.targets.length;
  const noun = count === 1 ? 'target' : 'targets';
  const why: Record<string, string> = {
    project: 'from tool config found in this project',
    machine: 'from tools installed on this machine',
    fallback: 'no tool config or install found, so a minimal set was used',
  };
  logger.info(
    `Enabled ${count} ${noun} (${why[data.targetSource]}): ${data.targets.join(', ')}. ` +
      `Edit ${data.configFile} or pass --targets a,b to change them.`,
  );
}

function renderLessons(lessons: NonNullable<InitCommandResult['data']['lessons']>): void {
  const cwd = process.cwd();
  const rel = (p: string): string => relative(cwd, p).replaceAll('\\', '/');
  for (const path of lessons.created) {
    logger.success(`  Created ${rel(path)}`);
  }
  for (const path of lessons.updated) {
    logger.success(`  Refreshed ${rel(path)} (managed — synced to the current manual)`);
  }
  for (const path of lessons.skipped) {
    logger.info(`  Kept ${rel(path)} (already current)`);
  }
  if (lessons.rootRuleUpdated) {
    logger.success('  Injected the Lessons ritual block into .agentsmesh/rules/_root.md');
  } else {
    logger.info('  .agentsmesh/rules/_root.md already carries the current Lessons block');
  }
  if (lessons.gitignoreUpdated) {
    logger.success('  Added the lessons runtime files (logs, lock, temp files) to .gitignore');
  }
  if (lessons.recallHookInjected) {
    logger.success(
      '  Wired the lessons recall hook into .agentsmesh/hooks.yaml (deterministic recall on targets whose hooks can inject context)',
    );
  }
  if (lessons.recallHookTeamHint) logger.warn(`  ${lessons.recallHookTeamHint}`);
  if (lessons.gitattributesUpdated) {
    logger.success(
      '  Bound .agentsmesh/lessons/lessons.json to the merge driver in .gitattributes (commit it so concurrent captures union-merge)',
    );
  }
  renderMergeDriver(lessons.mergeDriver);
  logger.success('Lessons subsystem ready (.agentsmesh/lessons/).');
  logger.info("  Run 'agentsmesh generate' to sync the ritual into every target.");
  logger.info('');
  // Only claim the graph is empty when THIS run created it; on a re-init over an
  // existing project the graph may already hold lessons.
  const graphCreated = lessons.created.some((p) =>
    p.replaceAll('\\', '/').endsWith('lessons.json'),
  );
  logger.info(
    graphCreated
      ? '  The graph starts empty and grows as agents capture failures. Try the loop:'
      : '  Recall + capture loop:',
  );
  logger.info(
    '    capture:  agentsmesh lessons add "<rule>" --topic <id> --new-topic --topic-summary "<line>" --trigger-file "<glob>"',
  );
  logger.info('    recall:   agentsmesh lessons query --file <path> --cmd <command>');
  logger.info(
    '    inspect:  agentsmesh lessons journal   |   lessons show <id>   |   lessons validate',
  );
  logger.info(
    '  Optional: set "telemetry": true in .agentsmesh/lessons/config.json to measure recall cost via `lessons stats`.',
  );
}

function renderMergeDriver(setup: MergeDriverSetup | undefined): void {
  if (setup === undefined) return;
  const line = mergeDriverSetupLine(setup);
  if (line === null) return;
  if (setup.status === 'failed' || setup.status === 'custom') {
    logger.warn(`  ${line}`);
    return;
  }
  logger.success(`  ${line}`);
  logger.info(
    "  Each teammate's clone gets the same setup the next time they run 'agentsmesh generate'.",
  );
}
