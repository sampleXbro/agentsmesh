/**
 * Human-readable renderer for `agentsmesh lessons` subcommands.
 * Query format defaults to `plain` — one rule per line — to minimize token
 * cost when an agent pastes the output into its context.
 */
import { logger } from '../../utils/output/logger.js';
import { LESSONS_USAGE } from '../commands/lessons-usage.js';
import type { LessonsCommandResult } from '../commands/lessons-types.js';
import type {
  LessonsAddData,
  LessonsImportMdData,
  LessonsJournalData,
  LessonsShowData,
  LessonsTopicsData,
} from '../commands/lessons-types.js';
import { renderPrune, renderStats, renderValidate } from './lessons-render-diagnostics.js';
import { renderQuery } from './lessons-render-query.js';
import { renderResolve } from './lessons-render-resolve.js';

export function renderLessons(result: LessonsCommandResult): void {
  if (result.error !== undefined && result.error.length > 0) {
    logger.error(result.error);
    // A failed command has only a placeholder data shape — don't fall through to
    // the success renderer (which would print e.g. a bogus "Existing lesson:").
    return;
  }
  switch (result.subcommand) {
    case 'help':
      return printHelp();
    case 'hook':
      // Raw harness JSON straight to stdout (no logger/ANSI) — the harness parses
      // it. Empty output = inject nothing.
      if (result.data.output.length > 0) process.stdout.write(`${result.data.output}\n`);
      return;
    case 'merge-driver':
      // Git captures the exit code; a successful union merge is silent (a failure
      // already printed its reason via the error-first check above).
      return;
    case 'query':
      return renderQuery(result.data, result.format);
    case 'add':
      return renderAdd(result.data);
    case 'topics':
      return renderTopics(result.data);
    case 'show':
      return renderShow(result.data);
    case 'deprecate':
      logger.success(
        result.data.supersededBy === null
          ? `Deprecated ${result.data.id}.`
          : `Superseded ${result.data.id} → ${result.data.supersededBy}.`,
      );
      return;
    case 'merge':
      if (result.exitCode === 0) {
        logger.success(`Merged ${result.data.loserId} → ${result.data.keeperId}.`);
      }
      return;
    case 'untrigger':
      logger.success(
        `Removed trigger ${result.data.triggerId} from ${result.data.lessonId} (${result.data.remainingTriggerCount} trigger${result.data.remainingTriggerCount === 1 ? '' : 's'} left)${result.data.removedTriggerNode ? '; trigger node garbage-collected (no other lesson used it)' : ''}.`,
      );
      return;
    case 'strip-markers':
      logger.success(
        `${result.data.dryRun ? 'Would strip' : 'Stripped'} legacy markers from ${result.data.changedCount} lesson${result.data.changedCount === 1 ? '' : 's'}.`,
      );
      return;
    case 'journal':
      return renderJournal(result.data);
    case 'validate':
      return renderValidate(result.data);
    case 'prune':
      return renderPrune(result.data);
    case 'stats':
      return renderStats(result.data, result.format);
    case 'resolve':
      return renderResolve(result.data);
    case 'import-md':
      return renderImportMd(result.data);
  }
}

function renderAdd(data: LessonsAddData): void {
  if (!data.isNewLesson) {
    // Re-capture upserts: report when new triggers were merged so the agent
    // knows its capture changed the lesson rather than being a silent no-op.
    if (data.newTriggerIds.length > 0) {
      const n = data.newTriggerIds.length;
      logger.success(`Updated lesson: ${data.id} (+${n} trigger${n === 1 ? '' : 's'})`);
    } else {
      logger.info(`Existing lesson: ${data.id} (no change)`);
    }
    renderGuardrails(data);
    return;
  }
  logger.success(`Added lesson: ${data.id}`);
  if (data.isNewTopic) logger.info('  created new topic');
  if (data.newTriggerIds.length > 0) {
    logger.info(`  new triggers: ${data.newTriggerIds.join(', ')}`);
  }
  renderGuardrails(data);
}

/** Non-blocking trigger-hygiene nudges — warn (stderr), never fail the capture. */
function renderGuardrails(data: LessonsAddData): void {
  if (data.locationNote !== undefined) logger.warn(data.locationNote);
  if (data.activationNote !== undefined) logger.warn(data.activationNote);
  for (const w of data.warnings) logger.warn(`${w.code}: ${w.message}`);
  const ap = data.autoPruned;
  if (ap !== undefined) {
    logger.info(
      `  auto-pruned: ${ap.removedTriggers} orphan trigger${ap.removedTriggers === 1 ? '' : 's'}, ${ap.removedTopics} orphan topic${ap.removedTopics === 1 ? '' : 's'}, ${ap.detachedDeadGlobs} dead glob${ap.detachedDeadGlobs === 1 ? '' : 's'} detached (git-reversible)`,
    );
  }
}

function renderTopics(data: LessonsTopicsData): void {
  if (data.topics.length === 0) {
    logger.info('(no topics)');
  } else {
    for (const t of data.topics) logger.info(`${t.id}  ${t.summary}`);
  }
  if (data.setupHint !== undefined) logger.warn(data.setupHint);
}

function renderShow(data: LessonsShowData): void {
  process.stdout.write(data.markdown);
}

function renderJournal(data: LessonsJournalData): void {
  for (const e of data.entries) logger.info(`${e.createdAt}  ${e.id}  ${e.rule}`);
  if (data.setupHint !== undefined) logger.warn(data.setupHint);
}

function renderImportMd(data: LessonsImportMdData): void {
  logger.success(
    `Imported lessons: topics=${data.topicCount} lessons=${data.lessonCount} triggers=${data.triggerCount}`,
  );
  logger.info(`  graph: ${data.wroteGraphPath.replaceAll('\\', '/')}`);
  if (data.deletedPaths.length > 0) {
    logger.info(
      `  removed legacy: ${data.deletedPaths.length} path${data.deletedPaths.length === 1 ? '' : 's'}`,
    );
  }
}

function printHelp(): void {
  logger.info('Usage: agentsmesh lessons <subcommand> [args] [flags]');
  logger.info('');
  logger.info('Subcommands:');
  // Derive the menu from the single source of truth so this overview can never
  // disagree with `agentsmesh lessons <sub> --help` (both read LESSONS_USAGE).
  for (const entry of Object.values(LESSONS_USAGE)) {
    const signature = entry.usage.replace(/^agentsmesh lessons /, '');
    const summary = entry.summary !== undefined ? `   (${entry.summary})` : '';
    logger.info(`  ${signature}${summary}`);
  }
}
