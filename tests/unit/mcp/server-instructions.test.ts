/**
 * The MCP server must carry the lessons ritual in its `instructions`.
 *
 * `init --lessons` writes a BLOCKING recall/capture paragraph into
 * `.agentsmesh/rules/_root.md`, which reaches every tool as a root rule. A
 * plugin cannot do that: it may ship skills, hooks and servers, but never the
 * user's instruction file. Without the paragraph the only standing signal is a
 * skill's one-line description, which is an advisory "use when" pointer — so
 * recall becomes discretionary and the completion receipt is never demanded.
 *
 * `instructions` is the one channel a server has for standing text: the client
 * receives it at initialize and puts it in front of the model, at no per-call
 * cost. Hooks would also work for Claude Code, but each invocation pays a fresh
 * npx resolution, which is why the bundle ships none.
 */

import { describe, it, expect } from 'vitest';
import { MCP_SERVER_INSTRUCTIONS } from '../../../src/mcp/instructions.js';
import { LESSONS_PROCEDURAL_RULE } from '../../../src/lessons/paths.js';

describe('MCP server instructions', () => {
  it('demands recall before a mutation', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/before (every|any) .*(edit|state-changing)/i);
    expect(MCP_SERVER_INSTRUCTIONS).toContain('lessons_query');
  });

  it('demands capture after a failure', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/after any failure/i);
    expect(MCP_SERVER_INSTRUCTIONS).toContain('lessons_add');
  });

  it('demands the completion receipt, which nothing else asks for', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('Lesson: captured');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('Lesson: none');
  });

  it('exempts pure reads, so recall cannot regress into infinite regress', () => {
    // The CLI contract carves this out deliberately; an instructions string
    // that omitted it would reintroduce "recall before the recall".
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/pure[- ]read/i);
  });

  it('names the canonical graph and forbids hand-editing it', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('.agentsmesh/lessons/lessons.json');
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/never hand-edit/i);
  });

  it('points at the skill for the full manual rather than inlining it', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('lessons');
    // Compact on purpose: this is always-on context in every session. The
    // rebuttal pedagogy lives in the skill, not here.
    expect(MCP_SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(1200);
  });

  it('speaks in tools, not shell, because a client using it may have no shell', () => {
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain('agentsmesh lessons query');
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain('agentsmesh lessons add');
  });

  it('carries the same three obligations as the CLI contract', () => {
    // Two vocabularies, one contract. If the CLI paragraph gains or loses an
    // obligation, this test is where the divergence should be noticed.
    for (const anchor of ['Lesson: captured', 'Lesson: none', '.agentsmesh/lessons/lessons.json']) {
      expect(LESSONS_PROCEDURAL_RULE).toContain(anchor);
      expect(MCP_SERVER_INSTRUCTIONS).toContain(anchor);
    }
  });
});
