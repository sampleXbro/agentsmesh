/**
 * Prompt recall has two caps: at most 5 triggered (keyword) rules, and the
 * always-on lessons within their own token budget. Whatever either cap hides
 * is named in the injected context; it used to be dropped silently.
 */

import { describe, expect, it } from 'vitest';
import { HOOK_INJECT_LIMIT } from '../../../src/lessons/hook-emit.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { alwaysLesson, count, graphOf, useHookProject } from './hook-test-helpers.js';

function graphWith(alwaysCount: number, alwaysRule: (i: number) => string): LessonsGraph {
  const entries: Parameters<typeof graphOf>[0] = {};
  for (let i = 0; i < 20; i += 1) {
    entries[`kw${i}`] = {
      rule: `Keyword rule ${i}.`,
      trigger: { kind: 'keyword', pattern: 'redos' },
    };
  }
  const graph = graphOf(entries);
  for (let i = 0; i < alwaysCount; i += 1) graph.lessons[`aw${i}`] = alwaysLesson(alwaysRule(i));
  return graph;
}

const prompt = (session: string): Record<string, unknown> => ({
  hook_event_name: 'UserPromptSubmit',
  session_id: session,
  prompt: 'fix the redos',
});

describe('prompt recall caps — 40 short always-on lessons + 20 keyword matches', () => {
  const project = useHookProject(() => graphWith(40, (i) => `Always ${i}.`));

  it('injects 5 keyword rules plus the always-on set, and names the 15 hidden matches', async () => {
    const ctx = await project.recall(prompt(project.session('caps')));
    expect(count(ctx, '- [kw')).toBe(HOOK_INJECT_LIMIT);
    expect(count(ctx, '- [aw')).toBe(40);
    expect(ctx).toContain(
      '(15 more matched; recall injects at most 5 rules per call. ' +
        "Narrow these lessons' triggers so the most relevant ones rank first.)",
    );
  });
});

describe('prompt recall caps — always-on lessons past their token budget', () => {
  const long = 'Always keep this long standard in mind while you work on every single file. ';
  const project = useHookProject(() => graphWith(60, (i) => `${long.repeat(3)}${i}`));

  it('names the always-on lessons that did not fit their budget', async () => {
    const ctx = await project.recall(prompt(project.session('always-cap')));
    const shown = count(ctx, '- [aw');
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(60);
    expect(ctx).toContain(
      `(${60 - shown} more always-on lessons did not fit their fixed token budget; ` +
        'shorten or merge the always-on lessons so each one fits.)',
    );
  });
});
