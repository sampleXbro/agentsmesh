import { existsSync, readFileSync } from 'node:fs';
import { lessonsPaths } from './paths.js';
import { DEFAULT_RECALL_LIMIT, DEFAULT_RECALL_MAX_TOKENS } from './ranking.js';

/**
 * Optional per-project recall tuning, read from `.agentsmesh/lessons/config.json`:
 *
 *   { "recallLimit": 5, "recallMaxTokens": 250 }
 *
 * Both fields are optional and independently fall back to the built-in defaults.
 * Lowering them keeps mandatory `--file`/`--cmd` recall lean on a large, high-fanout
 * graph (where recall otherwise returns many lessons per call); per-invocation
 * `--top`/`--all`/`--max-tokens` flags still override these.
 *
 * Recall is a BLOCKING hot path, so loading never throws: a missing/malformed
 * file or an invalid field silently uses the default for that field.
 */

export interface RecallConfig {
  readonly limit: number;
  readonly maxTokens: number;
}

/** Every tunable field with its default — the shape `init --lessons` writes out. */
export interface LessonsConfigFile {
  readonly recallLimit: number;
  readonly recallMaxTokens: number;
  readonly autoPrune: boolean;
  /** Opt into the recall and capture logs that `stats` and the health view read. */
  readonly telemetry: boolean;
  /** The outcome log behind effectiveness ranking; its own switch, on by default (see telemetry.ts). */
  readonly outcomeLog: boolean;
}

/**
 * The full default lessons config, materialized by `init --lessons` so every
 * tunable is discoverable and editable in one place (JSON has no comments). Built
 * from the same constants the readers fall back to, so writing it out is purely a
 * no-op for behaviour — only the file becomes visible. `autoPrune` is `false` to
 * mirror its off-by-default in `auto-prune.ts` (kept a literal here so the recall
 * hot path's config module never imports the prune machinery).
 */
export function defaultLessonsConfig(): LessonsConfigFile {
  return {
    recallLimit: DEFAULT_RECALL_LIMIT,
    recallMaxTokens: DEFAULT_RECALL_MAX_TOKENS,
    autoPrune: false,
    telemetry: false,
    outcomeLog: true,
  };
}

/**
 * Hard ceilings for the committed config. `config.json` is git-tracked, so a
 * cloned repo sets these; without a cap it could make every recall inject
 * hundreds of thousands of characters. 50 lessons / 8000 tokens (~32k chars)
 * is 5x/6x the defaults. Per-invocation flags are the user's own and not capped.
 */
export const MAX_RECALL_LIMIT = 50;
export const MAX_RECALL_MAX_TOKENS = 8000;

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function clamped(value: unknown, ceiling: number): number | null {
  const n = positiveInt(value);
  return n === null ? null : Math.min(n, ceiling);
}

function overCeiling(value: unknown, ceiling: number): boolean {
  const n = positiveInt(value);
  return n !== null && n > ceiling;
}

function invalidFields(fields: readonly string[], expected: string): string {
  return (
    `lessons config.json has invalid ${fields.join(' and ')} (expected ${expected}) — using the ` +
    `default for ${fields.length === 1 ? 'it' : 'them'}.`
  );
}

/**
 * Diagnose a present-but-broken `config.json` for a user-facing warning, WITHOUT
 * changing the silent hot-path fallback in {@link loadRecallConfig}. Returns a
 * message when the file exists but is unparseable JSON or carries an invalid
 * recall field (so a typo'd `recallLimit` does not silently revert to the default
 * with no signal); null when the file is absent or valid. Callers surface it on
 * stderr — the recall path itself stays non-throwing.
 */
export function lessonsConfigWarning(projectRoot: string): string | null {
  const path = lessonsPaths(projectRoot).config;
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return `lessons config.json is not valid JSON — using built-in recall defaults. Fix or delete .agentsmesh/lessons/config.json.`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return `lessons config.json is not a JSON object — using built-in recall defaults.`;
  }
  const cfg = parsed as Record<string, unknown>;
  const badInts = ['recallLimit', 'recallMaxTokens'].filter(
    (key) => key in cfg && positiveInt(cfg[key]) === null,
  );
  const badSwitches = ['autoPrune', 'telemetry', 'outcomeLog'].filter(
    (key) => key in cfg && typeof cfg[key] !== 'boolean',
  );
  const invalid = [
    ...(badInts.length > 0 ? [invalidFields(badInts, 'a positive integer')] : []),
    ...(badSwitches.length > 0 ? [invalidFields(badSwitches, 'true or false')] : []),
  ];
  if (invalid.length > 0) return invalid.join(' ');
  const over: string[] = [];
  if (overCeiling(cfg.recallLimit, MAX_RECALL_LIMIT))
    over.push(`recallLimit above ${MAX_RECALL_LIMIT}`);
  if (overCeiling(cfg.recallMaxTokens, MAX_RECALL_MAX_TOKENS)) {
    over.push(`recallMaxTokens above ${MAX_RECALL_MAX_TOKENS}`);
  }
  if (over.length > 0) {
    return `lessons config.json sets ${over.join(' and ')} — clamped to the ceiling.`;
  }
  return null;
}

export function loadRecallConfig(projectRoot: string): RecallConfig {
  const fallback: RecallConfig = {
    limit: DEFAULT_RECALL_LIMIT,
    maxTokens: DEFAULT_RECALL_MAX_TOKENS,
  };
  const path = lessonsPaths(projectRoot).config;
  if (!existsSync(path)) return fallback;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const cfg = parsed as Record<string, unknown>;
    return {
      limit: clamped(cfg.recallLimit, MAX_RECALL_LIMIT) ?? fallback.limit,
      maxTokens: clamped(cfg.recallMaxTokens, MAX_RECALL_MAX_TOKENS) ?? fallback.maxTokens,
    };
  } catch {
    return fallback;
  }
}
