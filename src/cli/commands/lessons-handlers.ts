import { captureLogExists, readCaptureLog } from '../../lessons/capture-telemetry.js';
import { emptyGraph } from '../../lessons/graph-schema.js';
import { tryLoadLessonsGraph } from '../../lessons/graph-store.js';
import { buildRecallHookOutput } from '../../lessons/hook.js';
import { lessonsActivated, lessonsSetupHint } from '../../lessons/paths.js';
import { outcomeLogExists, readOutcomeLog } from '../../lessons/outcome-log.js';
import { summarizeCapture } from '../../lessons/stats-capture.js';
import { summarizeEffectiveness } from '../../lessons/stats-effectiveness.js';
import { statsAdvice } from '../../lessons/stats-advice.js';
import { summarizeRecall } from '../../lessons/stats.js';
import { isTelemetryEnabled, readRecallLog, recallLogExists } from '../../lessons/telemetry.js';
import {
  errorResult,
  renderLessonMarkdown,
  renderTopicMarkdown,
  type LessonsFlags,
} from './lessons-helpers.js';
import type { LessonsCommandResult, LessonsJournalData } from './lessons-types.js';

export type { LessonsFlags } from './lessons-helpers.js';
// Recall (read-heavy, dedup-aware) lives in its own module; re-exported so the
// dispatcher keeps importing every handler from here.
export { doQuery } from './lessons-query-handler.js';
export { doMergeDriver } from './lessons-merge-driver-handler.js';
// Write-side handlers live in a sibling module to keep each file focused.
export { doAdd, doDeprecate } from './lessons-write-handlers.js';
export { doMerge, doStripMarkers, doUntrigger } from './lessons-curation-handlers.js';
export { doImportMd } from './lessons-import-md-handler.js';
export { doPrune } from './lessons-prune-handler.js';

export function doTopics(projectRoot: string): LessonsCommandResult {
  const graph = tryLoadLessonsGraph(projectRoot) ?? emptyGraph();
  const topics = Object.entries(graph.topics)
    .map(([id, t]) => ({ id, summary: t.summary }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const setupHint = lessonsActivated(projectRoot) ? undefined : lessonsSetupHint();
  return {
    subcommand: 'topics',
    exitCode: 0,
    data: { topics, ...(setupHint ? { setupHint } : {}) },
  };
}

export function doShow(arg: string | undefined, projectRoot: string): LessonsCommandResult {
  if (arg === undefined || arg === '') {
    return errorResult('show', 'Usage: agentsmesh lessons show <topic|lesson-id>', 2);
  }
  const graph = tryLoadLessonsGraph(projectRoot);
  if (graph !== null && graph.topics[arg] !== undefined) {
    const lessons = Object.entries(graph.lessons)
      .filter(([, l]) => l.topics.includes(arg) && l.status === 'active')
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const markdown = renderTopicMarkdown(arg, graph.topics[arg].summary, lessons);
    return { subcommand: 'show', exitCode: 0, data: { subject: arg, markdown } };
  }
  // Fall back to lesson-id lookup so a recalled lesson can be inspected by id
  // (rule, status, topics, and every trigger resolved to its pattern).
  if (graph !== null && graph.lessons[arg] !== undefined) {
    const markdown = renderLessonMarkdown(arg, graph.lessons[arg], graph.triggers);
    return { subcommand: 'show', exitCode: 0, data: { subject: arg, markdown } };
  }
  return errorResult(
    'show',
    `Unknown topic or lesson id: ${arg}. Run \`agentsmesh lessons topics\` to list topics, or \`agentsmesh lessons journal\` to list lesson ids.`,
    1,
  );
}

export function doJournal(projectRoot: string): LessonsCommandResult {
  const graph = tryLoadLessonsGraph(projectRoot) ?? emptyGraph();
  const entries = Object.entries(graph.lessons)
    .map(([id, l]) => ({ id, rule: l.rule, createdAt: l.createdAt, topics: [...l.topics] }))
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  const setupHint = lessonsActivated(projectRoot) ? undefined : lessonsSetupHint();
  const data: LessonsJournalData = { entries, ...(setupHint ? { setupHint } : {}) };
  return { subcommand: 'journal', exitCode: 0, data };
}

export function doStats(flags: LessonsFlags, projectRoot: string): LessonsCommandResult {
  const graph = tryLoadLessonsGraph(projectRoot) ?? emptyGraph();
  const records = readRecallLog(projectRoot);
  const report = summarizeRecall(records, graph);
  const captureReport = summarizeCapture(readCaptureLog(projectRoot));
  // The benefit side: did delivered lessons prevent the repeat? (Coarse — see the report.)
  const effectiveness = summarizeEffectiveness(readOutcomeLog(projectRoot), graph);
  const format = flags.json === true ? 'json' : 'text';
  return {
    subcommand: 'stats',
    exitCode: 0,
    format,
    data: {
      report,
      captureReport,
      effectiveness,
      advice: statsAdvice(records, graph, report),
      hasLog: recallLogExists(projectRoot),
      hasCaptureLog: captureLogExists(projectRoot),
      hasOutcomeLog: outcomeLogExists(projectRoot),
      telemetryEnabled: isTelemetryEnabled(process.env, projectRoot),
    },
  };
}

/**
 * Hook-mode recall (internal — invoked by a generated PostToolUse hook, not by a
 * human). Reads the harness hook payload from stdin, recalls lessons for the
 * touched file/command, and emits the harness context-injection JSON on stdout.
 * Exits 0 (or the code the host needs, e.g. 2 for Copilot failures) and stays
 * silent on any unrecognized input or unexpected error, so a wired hook can
 * never break the harness.
 */
export async function doHook(projectRoot: string): Promise<LessonsCommandResult> {
  try {
    const raw = await readStdin();
    const { output, exitCode } = await buildRecallHookOutput(raw, projectRoot);
    return { subcommand: 'hook', exitCode: exitCode ?? 0, data: { output } };
  } catch {
    return { subcommand: 'hook', exitCode: 0, data: { output: '' } };
  }
}

/**
 * A PostToolUse hook payload is a few hundred bytes of JSON. Cap the read so an
 * unbounded pipe (a runaway or hostile producer) cannot exhaust memory; past the
 * cap we abandon the read and return '' — the caller then injects nothing.
 */
export const MAX_HOOK_STDIN_BYTES = 1_000_000;

/**
 * Accumulate an async byte stream into a UTF-8 string, abandoning the read (and
 * returning '') once it exceeds `maxBytes`. Exported (and source-injectable) so
 * the size bound is unit-testable without a real unbounded pipe.
 */
export async function readBoundedStream(
  source: AsyncIterable<Buffer>,
  maxBytes = MAX_HOOK_STDIN_BYTES,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) return '';
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY === true) return '';
  return readBoundedStream(process.stdin);
}
