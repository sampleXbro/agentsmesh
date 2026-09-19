/**
 * Human-readable renderer for init command output.
 */

import { relative } from 'node:path';
import { LESSONS_MERGE_DRIVER_CONFIG } from '../../lessons/merge-driver-setup.js';
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
  logger.success(`Created ${data.localConfigFile}`);

  if (data.gitignoreUpdated) {
    logger.success('Updated .gitignore');
  }

  if (data.lessons !== undefined) {
    renderLessons(data.lessons);
  }
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
    logger.success(
      '  Added .agentsmesh/lessons/recall-log.jsonl to .gitignore (opt-in telemetry stays out of git)',
    );
  }
  if (lessons.recallHookInjected) {
    logger.success(
      '  Wired the PostToolUse recall hook into .agentsmesh/hooks.yaml (deterministic recall on hook-capable targets)',
    );
  }
  if (lessons.gitattributesUpdated) {
    logger.success(
      '  Bound .agentsmesh/lessons/lessons.json to the merge driver in .gitattributes (commit it so concurrent captures union-merge)',
    );
  }
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
    '  Optional: export AGENTSMESH_LESSONS_TELEMETRY=1 to measure recall cost via `lessons stats`.',
  );
  if (lessons.gitattributesUpdated) {
    logger.info(
      '  Team: each clone enables the merge driver once (the per-clone half git cannot auto-run):',
    );
    for (const cmd of LESSONS_MERGE_DRIVER_CONFIG) {
      logger.info(`    ${cmd}`);
    }
  }
}
