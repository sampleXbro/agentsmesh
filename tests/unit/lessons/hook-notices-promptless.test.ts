import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { graphFilePath } from '../../../src/lessons/graph-store.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { graphOf, useHookProject } from './hook-test-helpers.js';

/**
 * Session-start events that carry no prompt run no keyword recall, so the
 * graph health must be read on its own. On Cursor, sessionStart is the only
 * recall event: without this an unreadable graph turned recall off silently.
 */

const project = useHookProject(() =>
  graphOf({ s: { rule: 'Source rule.', trigger: { kind: 'file_glob', pattern: 'src/**' } } }),
);

const CONFLICT = '<<<<<<< HEAD\n{"version":2}\n=======\n{"version":2}\n>>>>>>> theirs\n';
const OFF = 'lesson recall is off';

function writeGraphText(text: string): void {
  writeFileSync(graphFilePath(project.root()), text, 'utf8');
}

async function hook(payload: Record<string, unknown>): Promise<string> {
  return (await buildRecallHookOutput(JSON.stringify(payload), project.root())).output;
}

const cursorStart = (s: string): Record<string, unknown> => ({
  conversation_id: s,
  session_id: s,
  hook_event_name: 'sessionStart',
  workspace_roots: [project.root()],
});
const copilotStart = (s: string): Record<string, unknown> => ({
  sessionId: s,
  cwd: project.root(),
  source: 'new',
});
const claudePrompt = (s: string): Record<string, unknown> => ({
  session_id: s,
  hook_event_name: 'UserPromptSubmit',
  cwd: project.root(),
});

describe('unreadable-graph notice on prompt-less events', () => {
  it('Cursor sessionStart names the merge conflict', async () => {
    writeGraphText(CONFLICT);
    const out = await hook(cursorStart(project.session('cursor')));
    expect(out).toContain('merge conflict');
    expect(out).toContain(OFF);
  });

  it('Copilot sessionStart without initialPrompt calls the graph corrupt', async () => {
    writeGraphText('{ "version": 2, "lessons": ');
    const out = await hook(copilotStart(project.session('copilot')));
    expect(out).toContain('corrupt');
    expect(out).toContain(OFF);
  });

  it('Claude UserPromptSubmit without a prompt warns once per session', async () => {
    writeGraphText(CONFLICT);
    const s = project.session('claude');
    expect(await hook(claudePrompt(s))).toContain(OFF);
    expect(await hook(claudePrompt(s))).toBe('');
  });

  it('asks for an upgrade when the graph is a newer schema', async () => {
    writeGraphText(JSON.stringify({ version: 99, lessons: {}, topics: {}, triggers: {} }));
    expect(await hook(cursorStart(project.session('newer')))).toContain('Upgrade agentsmesh');
  });

  it('stays silent for a healthy graph', async () => {
    expect(await hook(claudePrompt(project.session('healthy')))).not.toContain(OFF);
  });
});
