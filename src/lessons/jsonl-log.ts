import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

/**
 * Generic append-only JSONL log primitive shared by the recall- and
 * capture-telemetry modules. One JSON object per line; readers skip torn lines
 * (a crash mid-append or a hand-edit) and rows their guard rejects, so a
 * diagnostic log can never crash stats. Every call is best-effort: a log that
 * cannot be written or read never breaks the recall hook or the command.
 *
 * Bounded by a byte-size trigger on append (cheap `statSync`, full rewrite only
 * when it grows past the trigger) plus an atomic last-N truncation, so a
 * committed `.agentsmesh/` never accumulates an unbounded diagnostic file. The
 * caller owns the on/off gate (telemetry env) and the path — this module is pure
 * filesystem plumbing.
 */

/** True when a log file exists — distinguishes "never recorded" from "empty". */
export function logExists(path: string): boolean {
  return existsSync(path);
}

export interface JsonlAppendOptions {
  /** Keep at most this many records; older ones drop on truncation. */
  readonly maxRecords: number;
  /** Byte size past which the log self-truncates to {@link JsonlAppendOptions.maxRecords}. */
  readonly trimTriggerBytes: number;
}

/**
 * Append one record, creating parent dirs; truncate when past the byte trigger.
 * Never throws: a read-only or broken log path just drops the record.
 */
export function appendJsonl(path: string, record: unknown, opts: JsonlAppendOptions): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
    if (statSync(path).size > opts.trimTriggerBytes) capJsonl(path, opts.maxRecords);
  } catch {
    // Diagnostic side channel: losing a record beats breaking the caller.
  }
}

/**
 * Truncate the log to its last `maxRecords` records. No-op when absent or
 * already within the cap. Rewrites atomically (temp + rename) so a reader never
 * sees a torn file. Idempotent and safe to call from any append path.
 */
export function capJsonl(path: string, maxRecords: number): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length <= maxRecords) return;
  const kept = lines.slice(lines.length - maxRecords);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${kept.join('\n')}\n`, 'utf8');
  renameSync(tmp, path);
}

/**
 * Read every record `isRecord` accepts, skipping torn or malformed lines.
 * Returns [] when the log is absent or cannot be read.
 */
export function readJsonl<T>(path: string, isRecord: (value: unknown) => value is T): T[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isRecord(value)) out.push(value);
    } catch {
      // A torn final line (crash mid-append) or hand-edit — skip it, don't fail stats.
    }
  }
  return out;
}
