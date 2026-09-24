import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { stripBom } from '../utils/filesystem/fs-text-encoding.js';
import { dirname, resolve } from 'node:path';
import { CURRENT_GRAPH_VERSION, parseGraph, type LessonsGraph } from './graph-schema.js';
import { assertLessonsDirInsideProject } from './lessons-dir-guard.js';

/** Project-relative path of the lessons graph, forward slashes. */
export const LESSONS_GRAPH_PATH = '.agentsmesh/lessons/lessons.json';

export function graphFilePath(projectRoot: string): string {
  return resolve(projectRoot, LESSONS_GRAPH_PATH);
}

export function loadLessonsGraph(projectRoot: string): LessonsGraph {
  const raw = readFileSync(graphFilePath(projectRoot), 'utf8');
  return parseGraph(JSON.parse(stripBom(raw)));
}

export function tryLoadLessonsGraph(projectRoot: string): LessonsGraph | null {
  if (!existsSync(graphFilePath(projectRoot))) return null;
  return loadLessonsGraph(projectRoot);
}

/** Outcome of a non-throwing graph load — distinguishes absent from corrupt. */
export type ResilientGraphLoad =
  | { status: 'absent'; graph: null }
  | { status: 'ok'; graph: LessonsGraph }
  | { status: 'newer-version'; graph: null; version: number }
  | { status: 'corrupt'; graph: null; error: Error };

/**
 * Load the canonical graph WITHOUT throwing. Recall is a blocking requirement
 * before every edit and command, so a corrupt graph (a bad merge conflict in
 * the git-tracked JSON, a truncated file, or schema drift) must degrade to
 * "no lessons" rather than crash the agent's whole workflow with a stack trace.
 * Callers surface the `corrupt` outcome as a user-facing warning; the throwing
 * {@link loadLessonsGraph} stays the contract for paths that WANT to fail loud
 * (lint, validate).
 *
 * A graph stamped with a numeric `version` greater than this build's
 * {@link CURRENT_GRAPH_VERSION} is reported as `newer-version` (not `corrupt`):
 * the file is fine, the CLI is simply behind, so callers can show an upgrade
 * hint instead of a misleading "corrupt" warning.
 */
export function loadLessonsGraphResilient(projectRoot: string): ResilientGraphLoad {
  const path = graphFilePath(projectRoot);
  if (!existsSync(path)) return { status: 'absent', graph: null };
  try {
    const parsed: unknown = JSON.parse(stripBom(readFileSync(path, 'utf8')));
    const version = (parsed as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > CURRENT_GRAPH_VERSION) {
      return { status: 'newer-version', graph: null, version };
    }
    return { status: 'ok', graph: parseGraph(parsed) };
  } catch (error) {
    return {
      status: 'corrupt',
      graph: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** lessons.json is read-only (a user's choice): nothing is written over it. */
export class LessonsGraphReadOnlyError extends Error {
  constructor() {
    super(
      `${LESSONS_GRAPH_PATH} is read-only, so nothing was saved. Make it writable ` +
        `(chmod u+w ${LESSONS_GRAPH_PATH}) to change lessons.`,
    );
    this.name = 'LessonsGraphReadOnlyError';
  }
}

function fileMode(path: string): number | undefined {
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return undefined;
  }
}

function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function saveLessonsGraph(projectRoot: string, graph: LessonsGraph): void {
  assertLessonsDirInsideProject(projectRoot);
  const path = graphFilePath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  // The rename below would replace a read-only file and reset its mode.
  const mode = fileMode(path);
  if (mode !== undefined && !isWritable(path)) throw new LessonsGraphReadOnlyError();
  // Atomic write: a crash mid-write must never truncate the canonical graph.
  // Write to a sibling temp file, then rename over the target (atomic on the
  // same filesystem). The lessons lock serializes writers, so the pid-scoped
  // temp name cannot collide in practice.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, serializeGraph(graph), 'utf8');
  if (mode !== undefined) chmodSync(tmp, mode);
  renameSync(tmp, path);
}

/**
 * Deterministic serialization: every object's keys are emitted in alphabetical
 * order so diffs reflect content changes rather than insertion order. Output
 * always ends with a single trailing newline to keep CRLF/POSIX diffs clean.
 */
export function serializeGraph(graph: LessonsGraph): string {
  return `${JSON.stringify(canonicalize(graph), null, 2)}\n`;
}

/**
 * Order-independent canonical string for a value — equal content compares equal
 * regardless of key insertion order. Used by the merge driver to tell an
 * unchanged record from a genuinely divergent one.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalize(v);
    return out;
  }
  return value;
}
