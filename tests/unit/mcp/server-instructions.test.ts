/**
 * The MCP server hands every client standing text at initialize, because a
 * plugin can ship skills and servers but never the user's instruction file.
 * That is the only channel a plugin-only install has for the lessons contract.
 *
 * But the server also carries ~50 config tools, and the README advertises it on
 * its own. Most people who wire it up never opted into lessons. Sending them a
 * blocking recall mandate made three false promises at once: it named a graph
 * file they do not have, pointed at a skill they never installed, and required
 * a query before every edit that could only ever return nothing. Obeying the
 * capture half would have written a graph into a repository that never asked
 * for one.
 *
 * So the text is state-aware. Where lessons exist, the contract is binding.
 * Where they do not, the server says what it offers and how to start, and
 * claims nothing that is not on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcpServerInstructions } from '../../../src/mcp/instructions.js';
import { LESSONS_PROCEDURAL_RULE } from '../../../src/lessons/paths.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amesh-instructions-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function withLessons(options: { graph?: boolean; config?: boolean }): string {
  const base = join(dir, '.agentsmesh', 'lessons');
  mkdirSync(base, { recursive: true });
  if (options.graph) writeFileSync(join(base, 'lessons.json'), '{"topics":{},"lessons":{}}');
  if (options.config) writeFileSync(join(base, 'config.json'), '{}');
  return dir;
}

describe('where lessons are set up', () => {
  it('binds the agent to recall before a mutation', () => {
    const text = mcpServerInstructions(withLessons({ graph: true, config: true }));
    expect(text).toMatch(/before (every|any) .*(edit|state-changing)/i);
    expect(text).toContain('lessons_query');
  });

  it('binds the agent to capture after a failure, and to report a receipt', () => {
    const text = mcpServerInstructions(withLessons({ graph: true, config: true }));
    expect(text).toMatch(/after any failure/i);
    expect(text).toContain('lessons_add');
    expect(text).toContain('Lesson: captured');
    expect(text).toContain('Lesson: none');
  });

  it('applies to a graph captured without the full setup, which writes no config', () => {
    // A bare `lessons_add` bootstraps the graph but never config.json. Those
    // lessons are real and must still be recalled.
    expect(mcpServerInstructions(withLessons({ graph: true }))).toContain('BLOCKING');
  });

  it('applies to a wired project whose graph has not been created yet', () => {
    expect(mcpServerInstructions(withLessons({ config: true }))).toContain('BLOCKING');
  });

  it('applies when the server starts in a subdirectory of a project with lessons', () => {
    // Hosts start the server in the session's directory, often a package in a
    // monorepo. Checking only that directory told users nothing was set up
    // while the tools themselves could still find the graph.
    const project = withLessons({ graph: true, config: true });
    const pkg = join(project, 'packages', 'api');
    mkdirSync(pkg, { recursive: true });
    expect(mcpServerInstructions(pkg)).toContain('BLOCKING');
  });

  it('carries the same anchors as the CLI contract', () => {
    const text = mcpServerInstructions(withLessons({ graph: true, config: true }));
    for (const anchor of ['Lesson: captured', 'Lesson: none', '.agentsmesh/lessons/lessons.json']) {
      expect(LESSONS_PROCEDURAL_RULE).toContain(anchor);
      expect(text).toContain(anchor);
    }
  });
});

describe('where lessons are not set up', () => {
  it('mandates nothing, so no edit pays for a query that returns nothing', () => {
    const text = mcpServerInstructions(dir);
    expect(text).not.toContain('BLOCKING');
    expect(text).not.toMatch(/\bMUST\b/);
    expect(text).not.toContain('Lesson: captured');
  });

  it('claims no file and no skill that is not on disk', () => {
    const text = mcpServerInstructions(dir);
    expect(text).not.toMatch(/is canonical/);
    expect(text).not.toMatch(/Full manual/);
  });

  it('still says what the server offers and how to start, so the plugin is not mute', () => {
    const text = mcpServerInstructions(dir);
    expect(text).toContain('lessons_add');
    expect(text).toContain('agentsmesh init --lessons');
  });

  it('names the fields a first capture needs, since an empty graph has no topic yet', () => {
    const text = mcpServerInstructions(dir);
    expect(text).toContain('new_topic');
    expect(text).toContain('topic_summary');
  });

  it('stays short, since it is context every session pays for', () => {
    expect(mcpServerInstructions(dir).length).toBeLessThanOrEqual(600);
  });
});

describe('both forms', () => {
  it('speak in tools, not shell, because a client here may have no shell', () => {
    for (const root of [dir, withLessons({ graph: true, config: true })]) {
      const text = mcpServerInstructions(root);
      expect(text).not.toContain('agentsmesh lessons query');
      expect(text).not.toContain('agentsmesh lessons add');
    }
  });

  it('stay within a sane always-on budget', () => {
    expect(
      mcpServerInstructions(withLessons({ graph: true, config: true })).length,
    ).toBeLessThanOrEqual(1200);
  });
});
