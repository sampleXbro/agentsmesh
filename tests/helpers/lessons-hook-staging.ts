import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import { buildRecallHookOutput } from '../../src/lessons/hook.js';
import {
  driverDidNotRun,
  isolateGit,
  LESSONS_GRAPH,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from './lessons-merge-repo.js';

/** The hook's warning for a staging command while lessons.json is unmerged. */
export const STAGING_WARNING =
  'agentsmesh lessons: do not stage or commit yet. git still has ' +
  `${LESSONS_GRAPH} in a merge conflict, and the file does not hold the lessons from both ` +
  'branches (the lessons merge driver may not have run). Run `agentsmesh lessons resolve` ' +
  `BEFORE \`git add ${LESSONS_GRAPH}\`, or the other branch's lessons are dropped.`;

export const WARNED = {
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: STAGING_WARNING },
};

interface Call {
  readonly event?: string;
  readonly cwd?: string;
  readonly session?: string;
}

type MergeSides = Parameters<typeof mergeLessonsBranches>[2];

interface StagingRepo {
  readonly repo: () => string;
  /** Run the recall hook on a Bash command; the raw output, '' when it injects nothing. */
  readonly hook: (command: string, call?: Call) => Promise<string>;
  /** The driver did not run: lessons.json is this branch's file and git holds it unmerged. */
  readonly unmerged: (sides?: MergeSides) => void;
}

let n = 0;

/** A temp git repo per test, with env isolated from the host git and agent session. */
export function useStagingRepo(): StagingRepo {
  let repo = '';
  let restoreEnv: () => void = () => {};
  beforeAll(() => {
    restoreEnv = isolateGit();
  });
  afterAll(() => restoreEnv());
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'am-hook-staging-'));
    vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
    vi.stubEnv('AGENTSMESH_SESSION_ID', '');
    vi.stubEnv('CLAUDE_PROJECT_DIR', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(repo, { recursive: true, force: true });
  });
  return {
    repo: () => repo,
    hook: async (command, call = {}) => {
      n += 1;
      const payload = {
        session_id: call.session ?? `hook-staging-${process.pid}-${n}`,
        cwd: call.cwd ?? repo,
        hook_event_name: call.event ?? 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command },
      };
      return (await buildRecallHookOutput(JSON.stringify(payload), repo)).output;
    },
    unmerged: (sides = TWO_CAPTURES) => {
      expect(mergeLessonsBranches(repo, repo, sides)).not.toBe(0);
      driverDidNotRun(repo, repo);
    },
  };
}
