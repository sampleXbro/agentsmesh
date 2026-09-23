import { describe, expect, it } from 'vitest';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { contextOf, graphOf, useHookProject } from './hook-test-helpers.js';

const RULE = 'Never edit an applied migration; add a new one.';
const project = useHookProject(() =>
  graphOf({ mig: { rule: RULE, trigger: { kind: 'file_glob', pattern: 'db/migrations/**' } } }),
);

function edit(sessionId: string, agentId?: string): string {
  return JSON.stringify({
    session_id: sessionId,
    ...(agentId !== undefined ? { agent_id: agentId } : {}),
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: 'db/migrations/001.sql' },
  });
}

async function run(raw: string, root: string): Promise<string> {
  return contextOf((await buildRecallHookOutput(raw, root)).output);
}

describe('hook dedup is scoped per agent context', () => {
  it('delivers to a subagent a rule the main agent already received in the same session', async () => {
    const s = project.session('sub');
    expect(await run(edit(s), project.root())).toContain(RULE);
    expect(await run(edit(s, 'a1'), project.root())).toContain(RULE);
  });

  it('still dedups repeats inside the same subagent', async () => {
    const s = project.session('sub-repeat');
    expect(await run(edit(s, 'a1'), project.root())).toContain(RULE);
    expect(await run(edit(s, 'a1'), project.root())).toBe('');
  });

  it('keeps two subagents of one session apart', async () => {
    const s = project.session('two-subs');
    expect(await run(edit(s, 'a1'), project.root())).toContain(RULE);
    expect(await run(edit(s, 'a2'), project.root())).toContain(RULE);
  });

  it('a subagent delivery does not suppress the main agent', async () => {
    const s = project.session('sub-first');
    expect(await run(edit(s, 'a1'), project.root())).toContain(RULE);
    expect(await run(edit(s), project.root())).toContain(RULE);
    expect(await run(edit(s), project.root())).toBe('');
  });

  it('keeps UserPromptSubmit always-on lessons per agent context too', async () => {
    const s = project.session('prompt');
    const prompt = (agentId?: string): string =>
      JSON.stringify({
        session_id: s,
        ...(agentId !== undefined ? { agent_id: agentId } : {}),
        hook_event_name: 'UserPromptSubmit',
        prompt: 'touch db migrations',
      });
    const root = project.root();
    saveLessonsGraph(root, {
      version: 2,
      lessons: {
        aw: {
          rule: 'Universal rule.',
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
    expect(await run(prompt(), root)).toContain('Universal rule.');
    expect(await run(prompt(), root)).toBe('');
    expect(await run(prompt('a1'), root)).toContain('Universal rule.');
  });
});
