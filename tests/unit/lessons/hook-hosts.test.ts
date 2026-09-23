import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { RECALL_BLOCK_OPEN } from '../../../src/lessons/rule-line.js';
import { contextOf, graphOf, useHookProject } from './hook-test-helpers.js';

const ALWAYS = 'Universal rule.';
const KEYWORD = 'Guard every regex against redos.';

function hostGraph(): LessonsGraph {
  const g = graphOf({ kw: { rule: KEYWORD, trigger: { kind: 'keyword', pattern: 'redos' } } });
  return {
    ...g,
    lessons: {
      ...g.lessons,
      aw: {
        rule: ALWAYS,
        topics: ['t'],
        triggers: [],
        evidence: [],
        status: 'active',
        scope: 'always',
        createdAt: '2026-06-05',
      },
    },
  };
}

const project = useHookProject(hostGraph);

/** Run the hook from a directory outside the project, so the root must come from the payload. */
async function run(
  payload: Record<string, unknown>,
): Promise<{ output: string; exitCode?: number }> {
  const elsewhere = realpathSync(join(project.root(), '..'));
  return buildRecallHookOutput(JSON.stringify(payload), elsewhere, {});
}

const parse = (output: string): Record<string, unknown> =>
  JSON.parse(output) as Record<string, unknown>;

describe('Gemini CLI (geminicli.com/docs/hooks/reference)', () => {
  const beforeAgent = (session: string): Record<string, unknown> => ({
    session_id: session,
    transcript_path: '/tmp/t.json',
    cwd: project.root(),
    hook_event_name: 'BeforeAgent',
    timestamp: '2026-09-22T10:00:00Z',
    prompt: 'please fix the redos bug',
  });

  it('BeforeAgent recalls like UserPromptSubmit and answers with hookEventName BeforeAgent', async () => {
    const { output } = await run(beforeAgent(project.session('gemini')));
    const out = parse(output) as { hookSpecificOutput: Record<string, string> };
    expect(Object.keys(out)).toEqual(['hookSpecificOutput']);
    expect(out.hookSpecificOutput.hookEventName).toBe('BeforeAgent');
    expect(out.hookSpecificOutput.additionalContext).toContain(`- [aw] ${ALWAYS}`);
    expect(out.hookSpecificOutput.additionalContext).toContain(`- [kw] ${KEYWORD}`);
  });

  it('SessionStart clear resets the dedup that BeforeAgent wrote', async () => {
    const s = project.session('gemini-clear');
    expect(contextOf((await run(beforeAgent(s))).output)).toContain(ALWAYS);
    expect((await run(beforeAgent(s))).output).toBe('');
    const clear = {
      session_id: s,
      cwd: project.root(),
      hook_event_name: 'SessionStart',
      source: 'clear',
    };
    expect((await run(clear)).output).toBe('');
    expect(contextOf((await run(beforeAgent(s))).output)).toContain(ALWAYS);
  });
});

describe('Cursor (cursor.com/docs/agent/hooks)', () => {
  const common = (event: string): Record<string, unknown> => ({
    conversation_id: 'conv-1',
    generation_id: 'gen-1',
    model: 'claude',
    hook_event_name: event,
    cursor_version: '1.7.0',
    workspace_roots: [project.root()],
    user_email: null,
    transcript_path: null,
  });

  it('sessionStart resets dedup and injects the always-on lessons as top-level additional_context', async () => {
    const payload = {
      ...common('sessionStart'),
      session_id: project.session('cursor'),
      is_background_agent: false,
      composer_mode: 'agent',
    };
    for (let i = 0; i < 2; i += 1) {
      const out = parse((await run(payload)).output);
      expect(Object.keys(out)).toEqual(['additional_context']);
      expect(out.additional_context).toContain(RECALL_BLOCK_OPEN);
      expect(out.additional_context).toContain(`- [aw] ${ALWAYS}`);
    }
  });

  it('postToolUseFailure gets the capture nudge as top-level additional_context', async () => {
    const payload = {
      ...common('postToolUseFailure'),
      tool_name: 'Shell',
      tool_input: { command: 'npm test' },
      tool_use_id: 'abc123',
      cwd: project.root(),
      error_message: 'Command timed out after 30s',
      failure_type: 'timeout',
      duration: 5000,
      is_interrupt: false,
    };
    const out = parse((await run(payload)).output);
    expect(Object.keys(out)).toEqual(['additional_context']);
    expect(out.additional_context).toContain('lessons add');
    expect(out.additional_context).toContain('--trigger-cmd');
  });
});

describe('GitHub Copilot, camelCase config (docs.github.com/en/copilot/reference/hooks-configuration)', () => {
  const start = (
    session: string,
    source: string,
    initialPrompt?: string,
  ): Record<string, unknown> => ({
    sessionId: session,
    timestamp: 1_704_614_400_000,
    cwd: project.root(),
    source,
    ...(initialPrompt !== undefined ? { initialPrompt } : {}),
  });

  it('sessionStart injects always-on and initialPrompt keyword lessons as flat additionalContext', async () => {
    const out = parse((await run(start(project.session('cp'), 'new', 'fix the redos bug'))).output);
    expect(Object.keys(out)).toEqual(['additionalContext']);
    expect(out.additionalContext).toContain(`- [aw] ${ALWAYS}`);
    expect(out.additionalContext).toContain(`- [kw] ${KEYWORD}`);
  });

  it('sessionStart keeps dedup on resume and resets it on startup and new', async () => {
    const s = project.session('cp-resume');
    expect((await run(start(s, 'startup'))).output).toContain(ALWAYS);
    expect((await run(start(s, 'resume'))).output).toBe('');
    expect((await run(start(s, 'new'))).output).toContain(ALWAYS);
  });

  it('postToolUseFailure gets the nudge as flat additionalContext and asks for exit code 2', async () => {
    const result = await run({
      sessionId: project.session('cp-fail'),
      timestamp: 1_704_614_400_000,
      cwd: project.root(),
      toolName: 'bash',
      toolArgs: { command: 'npm test' },
      error: 'Process exited with code 1',
    });
    const out = parse(result.output);
    expect(Object.keys(out)).toEqual(['additionalContext']);
    expect(out.additionalContext).toContain('--trigger-cmd');
    expect(result.exitCode).toBe(2);
  });

  it('postToolUseFailure reads JSON-string toolArgs and a path argument as the file', async () => {
    const out = parse(
      (
        await run({
          sessionId: project.session('cp-edit'),
          timestamp: 1_704_614_400_000,
          cwd: project.root(),
          toolName: 'edit',
          toolArgs: JSON.stringify({ path: join(project.root(), 'src', 'x.ts') }),
          error: 'old_str not found',
        })
      ).output,
    );
    expect(out.additionalContext).toContain("--trigger-file 'src/x.ts'");
  });

  it('shares one dedup key with snake_case session_id payloads', async () => {
    const s = project.session('shared');
    const prompt = {
      session_id: s,
      cwd: project.root(),
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hi',
    };
    expect(contextOf((await run(prompt)).output)).toContain(ALWAYS);
    expect((await run(start(s, 'resume'))).output).toBe('');
    expect((await run(start(project.session('fresh'), 'resume'))).output).toContain(ALWAYS);
  });
});
