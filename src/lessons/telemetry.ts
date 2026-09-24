import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripBom } from '../utils/filesystem/fs-text-encoding.js';
import { appendJsonl, logExists, readJsonl } from './jsonl-log.js';
import { isRecallRecord } from './log-record-guards.js';
import { lessonsPaths } from './paths.js';

/** Keep at most this many recall records; older ones are dropped on truncation. */
export const MAX_RECALL_LOG_RECORDS = 5000;

/**
 * Byte size past which {@link appendRecallRecord} truncates the log. Generous
 * headroom over {@link MAX_RECALL_LOG_RECORDS} worth of records so trimming is
 * rare (each append pays only a cheap `statSync`, never a full read).
 */
const RECALL_LOG_TRIM_TRIGGER_BYTES = 2_000_000;

/**
 * Opt-in recall telemetry. Mandatory recall runs before every edit/command, so
 * its *frequency* — not its per-call payload — is the real token cost. This log
 * captures one append-only record per recall so `lessons stats` can answer "is
 * per-action recall token-justified versus loading the whole active set once?".
 *
 * OFF by default. Opt in per project with `"telemetry": true` in
 * `.agentsmesh/lessons/config.json`, or per process with {@link TELEMETRY_ENV}
 * (`1` forces on, `0` forces off). The config path exists because the hooks are
 * the most important writer and a hook spawned by a desktop app inherits none of
 * the user's shell exports: an env-only gate left every hook blind for weeks
 * while the CLI in a terminal kept logging. Records carry field-PRESENCE
 * booleans only — never the raw file / command / keyword text — so the log stays
 * small and leaks no source content.
 */

export const TELEMETRY_ENV = 'AGENTSMESH_LESSONS_TELEMETRY';

/**
 * Optional session correlator. When the harness exports a stable id per agent
 * session, `stats` groups recalls by it for an honest per-session preload
 * comparison; absent it, `stats` falls back to time-gap clustering.
 */
export const SESSION_ENV = 'AGENTSMESH_SESSION_ID';

/** The session id for this process, or undefined when unset/blank. */
export function sessionId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env[SESSION_ENV];
  return raw !== undefined && raw.trim().length > 0 ? raw : undefined;
}

/** Per-recall telemetry row. One JSON object per line in {@link recallLogPath}. */
export interface RecallTelemetryRecord {
  /** ISO-8601 timestamp supplied by the caller. */
  readonly ts: string;
  readonly hasFile: boolean;
  readonly hasCommand: boolean;
  readonly hasKeyword: boolean;
  /** Active lessons that matched before ranking/cap. */
  readonly totalMatches: number;
  /** Lessons actually returned after limit + token budget. */
  readonly returnedCount: number;
  /** Estimated cumulative rule-token cost of the returned lessons. */
  readonly returnedTokens: number;
  /** True when caps hid matches (`totalMatches > returnedCount`). */
  readonly truncated: boolean;
  /**
   * The normalized action this recall was for (`file:src/x.ts`, `cmd:git commit`,
   * or `none` for a keyword-only query) — the SAME key the outcome log uses, so
   * this stores no content the logs did not already hold.
   *
   * Without it the log proves a recall happened but not for which action, so
   * occurrences per action cannot be counted and no before/after effectiveness
   * claim is computable. Optional because records written before this existed
   * have no key.
   */
  readonly contextKey?: string;
  /** Matched lessons attributable to each trigger kind (overlaps allowed). */
  readonly matchedByKind: {
    readonly file: number;
    readonly command: number;
    readonly keyword: number;
    /** Candidates reached by rule wording (lexical retrieval). Absent on older rows. */
    readonly text?: number;
  };
  /**
   * Session correlator from {@link SESSION_ENV}, when set. Lets `stats` group
   * recalls into sessions for the per-session preload comparison. Optional —
   * records predating this field, or made without the env, simply lack it and
   * `stats` clusters them by time gap instead.
   */
  readonly session?: string;
  /**
   * Ids of the lessons actually returned (post-cap). Lets `stats` measure
   * intra-session repeat-delivery (the dedup opportunity) without storing rule
   * text. Optional for backward compatibility with pre-field records.
   */
  readonly lessonIds?: readonly string[];
  /**
   * True when the recall ran with caps OFF (`--all`) — a diagnostic dump, not a
   * mandatory recall. `stats` excludes these from the mandatory-cost figure so a
   * few `--all` calls don't inflate the break-even against recall. Optional;
   * absent ⇒ treated as a normal (non-bypassed) recall.
   */
  readonly bypassed?: boolean;
}

/** Append-only JSONL recall log. Sibling of the canonical graph, never the graph. */
export function recallLogPath(projectRoot: string): string {
  return join(lessonsPaths(projectRoot).base, 'recall-log.jsonl');
}

/** A boolean field of the project's lessons config; undefined when absent or unreadable. */
export function configFlag(projectRoot: string, key: string): boolean | undefined {
  const path = lessonsPaths(projectRoot).config;
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(stripBom(readFileSync(path, 'utf8')));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const value = (parsed as Record<string, unknown>)[key];
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** `1`/`true`/`yes`/`on` force on, `0`/`false`/`no`/`off` force off; else the config decides. */
function envOverride(raw: string | undefined): boolean | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return undefined;
}

/**
 * The env var wins in both directions (`1` on, `0` off); otherwise the project
 * config decides when a root is known. Writers pass their project root so a
 * hook process with an empty environment still honours the project's opt-in.
 */
export function isTelemetryEnabled(
  env: NodeJS.ProcessEnv = process.env,
  projectRoot?: string,
): boolean {
  return (
    envOverride(env[TELEMETRY_ENV]) ??
    (projectRoot !== undefined && configFlag(projectRoot, 'telemetry') === true)
  );
}

/**
 * Env override for the outcome log (`1` on, `0` off). The outcome log is a
 * separate switch from telemetry: repeat-failure detection reads it, so it is
 * ON unless `.agentsmesh/lessons/config.json` sets `"outcomeLog": false`. It is
 * local, gitignored and holds normalized keys and error classes only.
 */
export const OUTCOME_LOG_ENV = 'AGENTSMESH_LESSONS_OUTCOME_LOG';

export function isOutcomeLogEnabled(
  env: NodeJS.ProcessEnv = process.env,
  projectRoot?: string,
): boolean {
  return (
    envOverride(env[OUTCOME_LOG_ENV]) ??
    (projectRoot === undefined || configFlag(projectRoot, 'outcomeLog') !== false)
  );
}

/**
 * Append one record to the recall log — a no-op unless telemetry is enabled, so
 * the recall hot path pays nothing in the default configuration.
 */
export function appendRecallRecord(
  projectRoot: string,
  record: RecallTelemetryRecord,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isTelemetryEnabled(env, projectRoot)) return;
  appendJsonl(recallLogPath(projectRoot), record, {
    maxRecords: MAX_RECALL_LOG_RECORDS,
    trimTriggerBytes: RECALL_LOG_TRIM_TRIGGER_BYTES,
  });
}

/** True when a recall log exists — distinguishes "never recorded" from "empty". */
export function recallLogExists(projectRoot: string): boolean {
  return logExists(recallLogPath(projectRoot));
}

/** Read every well-formed recall record. Returns [] when absent or unreadable. */
export function readRecallLog(projectRoot: string): RecallTelemetryRecord[] {
  return readJsonl(recallLogPath(projectRoot), isRecallRecord, {
    maxBytes: RECALL_LOG_TRIM_TRIGGER_BYTES,
  });
}
