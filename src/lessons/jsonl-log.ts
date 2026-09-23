import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
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
 * when it grows past the trigger) plus an atomic truncation to the last N
 * records within half the trigger, so a committed `.agentsmesh/` never
 * accumulates an unbounded diagnostic file, even from one giant line. The
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
    // A file cut off mid-line would glue this record onto the broken one.
    const lead = endsWithoutNewline(path) ? '\n' : '';
    appendFileSync(path, `${lead}${JSON.stringify(record)}\n`, 'utf8');
    if (statSync(path).size > opts.trimTriggerBytes) {
      capJsonl(path, opts.maxRecords, opts.trimTriggerBytes / 2);
    }
  } catch {
    // Diagnostic side channel: losing a record beats breaking the caller.
  }
}

function endsWithoutNewline(path: string): boolean {
  let fd: number | undefined;
  try {
    const size = statSync(path).size;
    if (size === 0) return false;
    fd = openSync(path, 'r');
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Truncate the log to its last `maxRecords` records that fit in `maxBytes`; a
 * single record larger than `maxBytes` is dropped. No-op when absent or already
 * within both caps. Rewrites atomically (temp + rename) so a reader never sees
 * a torn file. Idempotent and safe to call from any append path.
 */
export function capJsonl(path: string, maxRecords: number, maxBytes = Infinity): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const kept: string[] = [];
  let bytes = 0;
  for (let i = lines.length - 1; i >= 0 && kept.length < maxRecords; i -= 1) {
    const size = Buffer.byteLength(lines[i]!) + 1;
    if (size > maxBytes) continue;
    if (bytes + size > maxBytes) break;
    bytes += size;
    kept.push(lines[i]!);
  }
  if (kept.length === lines.length) return;
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, kept.length === 0 ? '' : `${kept.reverse().join('\n')}\n`, 'utf8');
  renameSync(tmp, path);
}

/** The whole file, or only its last `maxBytes` from the first full line on. */
function readTail(path: string, maxBytes: number | undefined): string {
  const size = maxBytes === undefined ? 0 : statSync(path).size;
  if (maxBytes === undefined || size <= maxBytes) return readFileSync(path, 'utf8');
  const fd = openSync(path, 'r');
  try {
    const tail = Buffer.alloc(maxBytes);
    readSync(fd, tail, 0, maxBytes, size - maxBytes);
    const text = tail.toString('utf8');
    return text.slice(text.indexOf('\n') + 1);
  } finally {
    closeSync(fd);
  }
}

/**
 * Read every record `isRecord` accepts, skipping torn or malformed lines; with
 * `maxBytes`, only the newest records in that many bytes. Returns [] when the
 * log is absent or cannot be read.
 */
export function readJsonl<T>(
  path: string,
  isRecord: (value: unknown) => value is T,
  opts: { readonly maxBytes?: number } = {},
): T[] {
  let text: string;
  try {
    text = readTail(path, opts.maxBytes);
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
