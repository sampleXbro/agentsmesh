import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RULE_LENGTH, type LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';

let root: string;
let counter = 0;
const sessions: string[] = [];
function uniqueSession(): string {
  const id = `hook-${process.pid}-${counter++}`;
  sessions.push(id);
  return id;
}

const graph: LessonsGraph = {
  version: 1,
  lessons: {
    a: {
      rule: 'Rule A.',
      topics: ['t'],
      triggers: ['t-glob'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-05',
    },
    b: {
      rule: 'Rule B.',
      topics: ['t'],
      triggers: ['t-glob'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-05',
    },
    c: {
      rule: 'Rule C.',
      topics: ['t'],
      triggers: ['t-cmd'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-05',
    },
    // Keyword-only (general/conceptual) lesson: unreachable on the file/command
    // path, surfaced only when its concept appears in the task text.
    d: {
      rule: 'Keyword rule D.',
      topics: ['t'],
      triggers: ['t-kw'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-05',
    },
  },
  topics: { t: { summary: 'T.' } },
  triggers: {
    't-glob': { kind: 'file_glob', pattern: 'src/**' },
    't-cmd': { kind: 'command_pattern', pattern: 'vitest' },
    't-kw': { kind: 'keyword', pattern: 'redos' },
  },
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-hook-'));
  saveLessonsGraph(root, graph);
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
  for (const id of sessions.splice(0)) {
    rmSync(join(tmpdir(), 'agentsmesh-lessons-seen', `${id}.json`), { force: true });
  }
});

describe('buildRecallHookOutput', () => {
  it('emits nothing on invalid JSON', async () => {
    expect((await buildRecallHookOutput('not json {', root)).output).toBe('');
  });

  it('emits nothing when the payload carries no file or command', async () => {
    expect((await buildRecallHookOutput(JSON.stringify({ tool_input: {} }), root)).output).toBe('');
    expect((await buildRecallHookOutput(JSON.stringify({}), root)).output).toBe('');
  });

  it('injects matching lessons as PostToolUse additionalContext for a file edit', async () => {
    const raw = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/x.ts' } });
    const parsed = JSON.parse((await buildRecallHookOutput(raw, root)).output) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Rule A.');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Rule B.');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('src/x.ts');
  });

  it('echoes hook_event_name so the SAME command guards the first touch as a PreToolUse hook', async () => {
    const raw = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/x.ts' },
    });
    const parsed = JSON.parse((await buildRecallHookOutput(raw, root)).output) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Rule A.');
  });

  it('defaults to PostToolUse for an absent event name, and does nothing for an unknown one', async () => {
    const absent = JSON.stringify({ tool_input: { file_path: 'src/x.ts' } });
    const parsed = JSON.parse((await buildRecallHookOutput(absent, root)).output) as {
      hookSpecificOutput: { hookEventName: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    const unknown = JSON.stringify({
      hook_event_name: 'SomethingElse',
      tool_input: { file_path: 'src/x.ts' },
    });
    expect((await buildRecallHookOutput(unknown, root)).output).toBe('');
  });

  it('recalls against a command for a Bash tool call', async () => {
    const raw = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npx vitest run' } });
    const out = (await buildRecallHookOutput(raw, root)).output;
    expect(out).toContain('Rule C.');
  });

  it('recalls against notebook_path for a NotebookEdit (matcher fires but file_path is absent)', async () => {
    const raw = JSON.stringify({
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: 'src/analysis.ipynb' },
    });
    const parsed = JSON.parse((await buildRecallHookOutput(raw, root)).output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Rule A.');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('src/analysis.ipynb');
  });

  it('emits nothing when no lessons match', async () => {
    const raw = JSON.stringify({ tool_input: { file_path: 'docs/unmatched.py' } });
    expect((await buildRecallHookOutput(raw, root)).output).toBe('');
  });

  it('recalls keyword lessons against the prompt text on UserPromptSubmit', async () => {
    // The tool-call path never sees task intent; UserPromptSubmit is the only event
    // that carries the prompt, so a keyword-only (conceptual) lesson fires here.
    const raw = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'please fix the redos vulnerability in the command matcher',
    });
    const parsed = JSON.parse((await buildRecallHookOutput(raw, root)).output) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Keyword rule D.');
    // A keyword-only lesson is NOT reachable via the file/command path — prove it.
    const asFile = JSON.stringify({ tool_input: { file_path: 'src/matcher.ts' } });
    expect((await buildRecallHookOutput(asFile, root)).output).not.toContain('Keyword rule D.');
  });

  it('also reads the prompt from a user_message field (field-name robustness)', async () => {
    const raw = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      user_message: 'audit the redos safety',
    });
    const out = (await buildRecallHookOutput(raw, root)).output;
    expect(out).toContain('Keyword rule D.');
  });

  it('emits nothing on UserPromptSubmit when the prompt matches no keyword lesson', async () => {
    const raw = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'just say hello world',
    });
    expect((await buildRecallHookOutput(raw, root)).output).toBe('');
  });

  it('injects an always-on lesson on UserPromptSubmit even when the prompt names nothing', async () => {
    // The "add a feature" case: a universal rule (comment style) that no keyword in
    // the prompt names, delivered because it is scope:'always'.
    saveLessonsGraph(root, {
      version: 2,
      lessons: {
        aw: {
          rule: 'Write comments per the repo style.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          scope: 'always',
          createdAt: '2026-06-05',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: {},
    });
    const raw = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'add a feature' });
    const parsed = JSON.parse((await buildRecallHookOutput(raw, root)).output) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      'Write comments per the repo style.',
    );
  });

  it('emits nothing on UserPromptSubmit with an absent or empty prompt', async () => {
    expect(
      (await buildRecallHookOutput(JSON.stringify({ hook_event_name: 'UserPromptSubmit' }), root))
        .output,
    ).toBe('');
    expect(
      (
        await buildRecallHookOutput(
          JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '' }),
          root,
        )
      ).output,
    ).toBe('');
  });

  it('nudges a capture decision on PostToolUseFailure, pre-filling the failed command trigger', async () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command: 'pnpm test' },
      tool_error: 'exit 1',
    });
    const parsed = JSON.parse((await buildRecallHookOutput(raw, root)).output) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUseFailure');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('lessons add');
    expect(parsed.hookSpecificOutput.additionalContext.toLowerCase()).toContain('failed');
    // A failed Bash command has no file — the pre-fill points at a command trigger.
    expect(parsed.hookSpecificOutput.additionalContext).toContain('--trigger-cmd');
  });

  it('pre-fills --trigger-file with the exact path on a failed file edit', async () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/lessons/hook.ts' },
    });
    const out = (await buildRecallHookOutput(raw, root)).output;
    expect(out).toContain("--trigger-file 'src/lessons/hook.ts'");
  });

  it('nudges at most once per session — a second failure in the same session is silent', async () => {
    const session = uniqueSession();
    const raw = JSON.stringify({
      session_id: session,
      hook_event_name: 'PostToolUseFailure',
      tool_input: { command: 'pnpm test' },
    });
    expect((await buildRecallHookOutput(raw, root)).output).not.toBe('');
    expect((await buildRecallHookOutput(raw, root)).output).toBe('');
  });

  it('dedups by session_id — a lesson is injected at most once per session', async () => {
    const raw = JSON.stringify({
      session_id: uniqueSession(),
      tool_input: { file_path: 'src/x.ts' },
    });
    expect((await buildRecallHookOutput(raw, root)).output).not.toBe('');
    // Second identical PostToolUse in the same session: everything already shown.
    expect((await buildRecallHookOutput(raw, root)).output).toBe('');
  });

  it('SessionStart source=compact resets dedup so summarized-away lessons re-inject', async () => {
    const session = uniqueSession();
    const edit = JSON.stringify({ session_id: session, tool_input: { file_path: 'src/x.ts' } });
    expect((await buildRecallHookOutput(edit, root)).output).not.toBe(''); // first: injects
    expect((await buildRecallHookOutput(edit, root)).output).toBe(''); // second: deduped
    // Context compacted → SessionStart emits nothing but resets the seen set.
    const compact = JSON.stringify({
      session_id: session,
      hook_event_name: 'SessionStart',
      source: 'compact',
    });
    expect((await buildRecallHookOutput(compact, root)).output).toBe('');
    // Now the lesson re-injects — it was dropped from context by the summary.
    expect((await buildRecallHookOutput(edit, root)).output).not.toBe('');
  });

  it('SessionStart source=startup RESETS dedup — a new chat must not inherit suppressions', async () => {
    const session = uniqueSession();
    const edit = JSON.stringify({ session_id: session, tool_input: { file_path: 'src/x.ts' } });
    expect((await buildRecallHookOutput(edit, root)).output).not.toBe('');
    // Suppressed while the same context is live.
    expect((await buildRecallHookOutput(edit, root)).output).toBe('');
    const startup = JSON.stringify({
      session_id: session,
      hook_event_name: 'SessionStart',
      source: 'startup',
    });
    expect((await buildRecallHookOutput(startup, root)).output).toBe('');
    // A new chat began: the rule must be delivered again.
    expect((await buildRecallHookOutput(edit, root)).output).not.toBe('');
  });

  it('SessionStart source=resume KEEPS the set — the prior context came back with it', async () => {
    const session = uniqueSession();
    const edit = JSON.stringify({ session_id: session, tool_input: { file_path: 'src/x.ts' } });
    expect((await buildRecallHookOutput(edit, root)).output).not.toBe('');
    const resume = JSON.stringify({
      session_id: session,
      hook_event_name: 'SessionStart',
      source: 'resume',
    });
    expect((await buildRecallHookOutput(resume, root)).output).toBe('');
    expect((await buildRecallHookOutput(edit, root)).output).toBe('');
  });

  it('truncates an over-long rule from an untrusted graph before injecting it', async () => {
    // A cloned-repo graph may carry a megabyte-scale rule; the hook must bound
    // what it injects regardless of what capture would have rejected.
    const huge = 'X'.repeat(MAX_RULE_LENGTH * 50);
    saveLessonsGraph(root, {
      version: 1,
      lessons: {
        big: {
          rule: huge,
          topics: ['t'],
          triggers: ['t-glob'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-05',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: { 't-glob': { kind: 'file_glob', pattern: 'src/**' } },
    });
    const raw = JSON.stringify({ tool_input: { file_path: 'src/x.ts' } });
    const parsed = JSON.parse((await buildRecallHookOutput(raw, root)).output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain('…[truncated]');
    // Bounded: the injected rule cannot exceed the cap (plus the bullet framing).
    expect(ctx.length).toBeLessThan(MAX_RULE_LENGTH + 200);
  });
});
