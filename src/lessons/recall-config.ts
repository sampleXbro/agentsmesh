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
  /** Opt into the recall/capture/outcome logs that `stats`, effectiveness ranking and the health view read. */
  readonly telemetry: boolean;
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
  };
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
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
  if (typeof parsed !== 'object' || parsed === null) {
    return `lessons config.json is not a JSON object — using built-in recall defaults.`;
  }
  const cfg = parsed as Record<string, unknown>;
  const bad: string[] = [];
  if ('recallLimit' in cfg && positiveInt(cfg.recallLimit) === null) bad.push('recallLimit');
  if ('recallMaxTokens' in cfg && positiveInt(cfg.recallMaxTokens) === null) {
    bad.push('recallMaxTokens');
  }
  if (bad.length > 0) {
    return `lessons config.json has invalid ${bad.join(' and ')} (expected a positive integer) — using the default for ${bad.length === 1 ? 'it' : 'them'}.`;
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
      limit: positiveInt(cfg.recallLimit) ?? fallback.limit,
      maxTokens: positiveInt(cfg.recallMaxTokens) ?? fallback.maxTokens,
    };
  } catch {
    return fallback;
  }
}
