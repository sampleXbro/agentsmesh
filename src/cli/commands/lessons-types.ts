import type { AutoPruneSummary } from '../../lessons/auto-prune.js';
import type { GuardrailWarning } from '../../lessons/capture-guardrails.js';
import type { CaptureStatsReport } from '../../lessons/stats-capture.js';
import type { EffectivenessStatsReport } from '../../lessons/stats-effectiveness.js';
import type { RecallStatsReport } from '../../lessons/stats.js';
import type { ValidationFinding } from '../../lessons/validate.js';

export type LessonsQueryFormat = 'plain' | 'md' | 'json';

export interface LessonsQueryData {
  readonly lessons: Array<{
    readonly id: string;
    readonly rule: string;
    readonly topics: string[];
    readonly triggers: string[];
    readonly evidence: string[];
    readonly score?: number;
    /** Reached by rule wording, not a trigger (keyword-only queries only). */
    readonly lexical?: true;
  }>;
  readonly query: { file?: string; command?: string; keyword?: string };
  readonly autoMigrated: boolean;
  /** Number of lessons that matched before ranking/cap — for truncation notices. */
  readonly totalMatches?: number;
  /** Matched lessons hidden because already delivered this session (dedup). */
  readonly suppressed?: number;
  /** Prefix each plain/md line with the lesson id (the `--ids` flag) for diagnosis. */
  readonly showIds?: boolean;
  /** Non-blocking warning (e.g. the canonical graph was corrupt) — shown on stderr. */
  readonly warning?: string;
}

export interface LessonsAddData {
  readonly id: string;
  readonly isNewLesson: boolean;
  readonly isNewTopic: boolean;
  readonly newTriggerIds: string[];
  readonly warnings: GuardrailWarning[];
  /** Cruft the opt-in auto-prune cleaned right after this capture (present only when it ran). */
  readonly autoPruned?: AutoPruneSummary;
  /** Set when the capture wrote to a CWD whose graph lives outside the nearest project. */
  readonly locationNote?: string;
  /** Set when the capture bootstrapped a graph-only state — recall isn't wired into any tool yet. */
  readonly activationNote?: string;
}

export interface LessonsTopicsData {
  readonly topics: Array<{ readonly id: string; readonly summary: string }>;
  /** Set when lessons is not fully set up here (no `init --lessons`) — shown on stderr. */
  readonly setupHint?: string;
}

export interface LessonsShowData {
  /** The topic id or lesson id that was shown. */
  readonly subject: string;
  readonly markdown: string;
}

export interface LessonsDeprecateData {
  readonly id: string;
  readonly supersededBy: string | null;
}

export interface LessonsMergeData {
  readonly loserId: string;
  readonly keeperId: string;
}

export interface LessonsUntriggerData {
  readonly lessonId: string;
  readonly triggerId: string;
  readonly removedTriggerNode: boolean;
  readonly remainingTriggerCount: number;
}

export interface LessonsStripMarkersData {
  readonly changedIds: string[];
  readonly changedCount: number;
  readonly dryRun: boolean;
}

export interface LessonsJournalData {
  readonly entries: Array<{
    readonly id: string;
    readonly rule: string;
    readonly createdAt: string;
    readonly topics: string[];
  }>;
  /** Set when lessons is not fully set up here (no `init --lessons`) — shown on stderr. */
  readonly setupHint?: string;
}

export interface LessonsValidateData {
  readonly ok: boolean;
  readonly findings: ValidationFinding[];
}

export interface LessonsResolveData {
  /** Where the two sides came from: git's merge stages, or the markers in the file. */
  readonly source: 'index' | 'markers';
  readonly path: string;
  readonly lessonCount: number;
  readonly onlyOurs: number;
  readonly onlyTheirs: number;
  /** Validation errors the merge created that neither side had. */
  readonly introduced: readonly string[];
}

export interface LessonsImportMdData {
  readonly topicCount: number;
  readonly lessonCount: number;
  readonly triggerCount: number;
  readonly wroteGraphPath: string;
  readonly deletedPaths: string[];
}

export interface LessonsPruneData {
  /** False for a dry run (nothing written); true once applied. */
  readonly applied: boolean;
  readonly cap: number;
  readonly removedTriggerIds: string[];
  readonly removedTopicIds: string[];
  readonly trimmedLessons: Array<{
    readonly id: string;
    readonly removedCount: number;
    readonly keptCount: number;
  }>;
  /** Dead `file_glob` triggers detached from lessons that keep ≥1 trigger. */
  readonly removedDeadGlobs: Array<{
    readonly id: string;
    readonly removedCount: number;
    readonly keptCount: number;
  }>;
  /** Active lessons left unreachable (every trigger is a dead glob) — reported only. */
  readonly unreachableLessons: string[];
}

export interface LessonsStatsData {
  readonly report: RecallStatsReport;
  /** Actionable diagnoses derived from the report (empty = nothing to flag). */
  readonly advice: readonly string[];
  /** Capture-side aggregate (totals, blocked, new vs upsert, trigger-kind mix). */
  readonly captureReport: CaptureStatsReport;
  /** Benefit-side aggregate (coarse) — did delivered lessons prevent the repeat? */
  readonly effectiveness: EffectivenessStatsReport;
  /** False when no recall log exists yet (telemetry never enabled). */
  readonly hasLog: boolean;
  /** False when no capture log exists yet — the capture block is shown only when true. */
  readonly hasCaptureLog: boolean;
  /** False when no outcome log exists yet — the effectiveness block is shown only when true. */
  readonly hasOutcomeLog: boolean;
  /** Whether telemetry is enabled in THIS process — tailors the empty-log hint. */
  readonly telemetryEnabled: boolean;
}

export type LessonsCommandResult =
  | { subcommand: 'help'; exitCode: number; error?: string; data: null }
  | {
      subcommand: 'query';
      exitCode: number;
      format: LessonsQueryFormat;
      data: LessonsQueryData;
      error?: string;
    }
  | { subcommand: 'add'; exitCode: number; data: LessonsAddData; error?: string }
  | { subcommand: 'topics'; exitCode: number; data: LessonsTopicsData; error?: string }
  | { subcommand: 'show'; exitCode: number; data: LessonsShowData; error?: string }
  | { subcommand: 'deprecate'; exitCode: number; data: LessonsDeprecateData; error?: string }
  | { subcommand: 'merge'; exitCode: number; data: LessonsMergeData; error?: string }
  | { subcommand: 'untrigger'; exitCode: number; data: LessonsUntriggerData; error?: string }
  | {
      subcommand: 'strip-markers';
      exitCode: number;
      data: LessonsStripMarkersData;
      error?: string;
    }
  | { subcommand: 'journal'; exitCode: number; data: LessonsJournalData; error?: string }
  | { subcommand: 'validate'; exitCode: number; data: LessonsValidateData; error?: string }
  | { subcommand: 'resolve'; exitCode: number; data: LessonsResolveData; error?: string }
  | { subcommand: 'import-md'; exitCode: number; data: LessonsImportMdData; error?: string }
  | { subcommand: 'prune'; exitCode: number; data: LessonsPruneData; error?: string }
  | {
      subcommand: 'stats';
      exitCode: number;
      format: 'text' | 'json';
      data: LessonsStatsData;
      error?: string;
    }
  | { subcommand: 'hook'; exitCode: number; data: { output: string }; error?: string }
  | { subcommand: 'merge-driver'; exitCode: number; data: { merged: boolean }; error?: string };
