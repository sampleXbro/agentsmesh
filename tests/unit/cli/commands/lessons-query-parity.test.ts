import { mkdirSync, mkdtempSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doQuery } from '../../../../src/cli/commands/lessons-handlers.js';
import type { LessonsFlags } from '../../../../src/cli/commands/lessons-helpers.js';
import type { LessonsQueryData } from '../../../../src/cli/commands/lessons-types.js';
import { commandFastpathCachePath } from '../../../../src/lessons/cmd-fastpath.js';
import type { Lesson, LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../../src/lessons/graph-store.js';
import { appendOutcomeEvent } from '../../../../src/lessons/outcome-log.js';
import { recallLessons } from '../../../../src/lessons/recall.js';
import { readRecallLog, TELEMETRY_ENV } from '../../../../src/lessons/telemetry.js';

/**
 * The CLI `lessons query` must answer like `lessons_query` and the hook: the same
 * ranking input (outcome-log effectiveness), the same command fast-path refresh,
 * the same session dedup for `--always`, and a relative `--file` read from the cwd.
 */

const base = {
  topics: ['t'],
  evidence: [],
  status: 'active' as const,
  createdAt: '2026-06-01',
};
const triggered = (rule: string, trigger: string): Lesson => ({
  ...base,
  rule,
  triggers: [trigger],
});
const alwaysOn = (rule: string, createdAt: string): Lesson => ({
  ...base,
  rule,
  triggers: [],
  scope: 'always',
  createdAt,
});

const graph: LessonsGraph = {
  version: 2,
  topics: { t: { summary: 'T.' } },
  triggers: {
    src: { kind: 'file_glob', pattern: 'src/**' },
    cli: { kind: 'file_glob', pattern: 'src/cli/**/*.ts' },
    wide: { kind: 'file_glob', pattern: '**/*' },
    cmd: { kind: 'command_pattern', pattern: '^git commit' },
  },
  lessons: {
    a: triggered('Rule a.', 'src'),
    b: triggered('Rule b.', 'src'),
    'cli-only': triggered('Rule for the cli folder.', 'cli'),
    'wide-open': triggered('Rule for every file.', 'wide'),
    'git-commit': triggered('Rule for commits.', 'cmd'),
    'always-new': alwaysOn('Always new.', '2026-06-10'),
    'always-old': alwaysOn('Always old.', '2026-06-02'),
  },
};

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-query-parity-')));
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
  vi.stubEnv(TELEMETRY_ENV, '');
  saveLessonsGraph(root, graph);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function query(flags: LessonsFlags, cwd?: string): LessonsQueryData {
  const result = doQuery(flags, root, false, undefined, cwd);
  if (result.subcommand !== 'query') throw new Error(`unexpected ${result.subcommand}`);
  return result.data;
}
const ids = (data: LessonsQueryData): string[] => data.lessons.map((l) => l.id);

describe('--always dedups like lessons_query', () => {
  it('shows the always-on rules once per session', () => {
    const flags = { always: true, session: 'parity-s1' };
    const first = query(flags);
    expect(ids(first)).toEqual(['always-new', 'always-old']);
    expect(first.suppressed).toBeUndefined();

    const second = query(flags);
    expect(second.lessons).toEqual([]);
    expect(second.suppressed).toBe(2);
  });

  it('brings them back with --no-dedup', () => {
    const flags = { always: true, session: 'parity-s2' };
    query(flags);
    const again = query({ ...flags, 'no-dedup': true });
    expect(ids(again)).toEqual(['always-new', 'always-old']);
    expect(again.suppressed).toBeUndefined();
  });

  it('counts always and ranked rules together in suppressed', () => {
    const flags = { always: true, command: 'git commit -m x', session: 'parity-s3' };
    expect(ids(query(flags))).toEqual(['always-new', 'always-old', 'git-commit']);
    const second = query(flags);
    expect(second.lessons).toEqual([]);
    expect(second.suppressed).toBe(3);
    expect(second.totalMatches).toBe(1);
  });

  it('keeps the metadata of an always-on rule in the data', () => {
    const [first] = query({ always: true }).lessons;
    expect(first).toEqual({
      id: 'always-new',
      rule: 'Always new.',
      topics: ['t'],
      triggers: [],
      evidence: [],
    });
  });
});

describe('the CLI ranks like recallLessons', () => {
  /** Three deliveries, each followed by a failure in the same session: score 0. */
  function failAfterEveryDelivery(lessonId: string): void {
    const on = { AGENTSMESH_LESSONS_OUTCOME_LOG: '1' } as NodeJS.ProcessEnv;
    const contextKey = 'file:src/x.ts';
    for (let i = 0; i < 3; i += 1) {
      const session = `${lessonId}${i}`;
      const ts = '2026-01-01T00:00:00Z';
      appendOutcomeEvent(root, { ts, kind: 'delivered', lessonId, contextKey, session }, on);
      appendOutcomeEvent(root, { ts, kind: 'failure', contextKey, session }, on);
    }
  }

  it('sinks a lesson that failed after every delivery, as the MCP tool does', async () => {
    failAfterEveryDelivery('a');
    const viaRecall = await recallLessons(root, { file: 'src/x.ts' }, { limit: 1 });
    expect(viaRecall.lessons.map((l) => l.id)).toEqual(['b']);
    expect(ids(query({ file: 'src/x.ts', top: '1' }))).toEqual(['b']);
  });

  it('refreshes the command fast-path cache', () => {
    expect(existsSync(commandFastpathCachePath(root))).toBe(false);
    query({ command: 'git commit -m x' });
    expect(existsSync(commandFastpathCachePath(root))).toBe(true);
  });

  it('writes exactly one recall record for --always plus a file', () => {
    vi.stubEnv(TELEMETRY_ENV, '1');
    query({ always: true, file: 'src/x.ts', session: 'parity-s4' });
    expect(readRecallLog(root)).toHaveLength(1);
  });

  it('marks --all as a bypass in the recall record', () => {
    vi.stubEnv(TELEMETRY_ENV, '1');
    query({ all: true, file: 'src/x.ts' });
    expect(readRecallLog(root).map((r) => r.bypassed)).toEqual([true]);
  });
});

describe('a relative --file typed in a sub folder', () => {
  const cli = (): string => join(root, 'src', 'cli');
  beforeEach(() => mkdirSync(cli(), { recursive: true }));

  it('is read from the cwd', () => {
    const data = query({ file: 'foo.ts' }, cli());
    expect(data.query.file).toBe('src/cli/foo.ts');
    expect(ids(data).sort()).toEqual(['a', 'b', 'cli-only', 'wide-open']);
  });

  it('still accepts a project-relative path', () => {
    const data = query({ file: 'src/cli/foo.ts' }, cli());
    expect(data.query.file).toBe('src/cli/foo.ts');
  });

  it('reads the path from the project root when run at the root', () => {
    const data = query({ file: 'foo.ts' }, root);
    expect(data.query.file).toBe('foo.ts');
    expect(ids(data)).toEqual(['wide-open']);
  });
});
