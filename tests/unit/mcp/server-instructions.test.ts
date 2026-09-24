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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcpServerInstructions } from '../../../src/mcp/instructions.js';
import { LESSONS_PROCEDURAL_RULE } from '../../../src/lessons/paths.js';

const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: (): string => fakeHome.dir };
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amesh-instructions-'));
  fakeHome.dir = join(dir, 'home');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function withLessons(options: { graph?: boolean; config?: boolean }, at: string = dir): string {
  const base = join(at, '.agentsmesh', 'lessons');
  mkdirSync(base, { recursive: true });
  if (options.graph) writeFileSync(join(base, 'lessons.json'), '{"topics":{},"lessons":{}}');
  if (options.config) writeFileSync(join(base, 'config.json'), '{}');
  return at;
}

/** Shell commands a tools-only client may be unable to run. */
function expectNoShell(text: string): void {
  expect(text).not.toContain('agentsmesh lessons query');
  expect(text).not.toContain('agentsmesh lessons add');
}

describe('where lessons are set up', () => {
  it('binds recall and capture in tool terms, with the CLI anchors, within budget', () => {
    const text = mcpServerInstructions(withLessons({ graph: true, config: true }));
    // Recall before a mutation.
    expect(text).toMatch(/before (every|any) .*(edit|state-changing)/i);
    expect(text).toContain('lessons_query');
    // Capture after a failure, and report a receipt.
    expect(text).toMatch(/after any failure/i);
    expect(text).toContain('lessons_add');
    // The same anchors as the CLI contract.
    for (const anchor of ['Lesson: captured', 'Lesson: none', '.agentsmesh/lessons/lessons.json']) {
      expect(LESSONS_PROCEDURAL_RULE).toContain(anchor);
      expect(text).toContain(anchor);
    }
    // A client here may have no shell.
    expectNoShell(text);
    expect(text.length).toBeLessThanOrEqual(1200);
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
});

describe('where lessons are not set up', () => {
  it('mandates nothing and claims nothing absent, but still says how to start, briefly', () => {
    const text = mcpServerInstructions(dir);
    // No edit pays for a query that returns nothing.
    expect(text).not.toContain('BLOCKING');
    expect(text).not.toMatch(/\bMUST\b/);
    expect(text).not.toContain('Lesson: captured');
    // No file and no skill that is not on disk.
    expect(text).not.toMatch(/is canonical/);
    expect(text).not.toMatch(/Full manual/);
    // What the server offers and how to start, so the plugin is not mute.
    expect(text).toContain('lessons_add');
    expect(text).toContain('agentsmesh init --lessons');
    // The fields a first capture needs, since an empty graph has no topic yet.
    expect(text).toContain('new_topic');
    expect(text).toContain('topic_summary');
    expectNoShell(text);
    // Context every session pays for.
    expect(text.length).toBeLessThanOrEqual(600);
  });

  it('says capture works inside an agentsmesh project, since it is refused outside one', () => {
    const text = mcpServerInstructions(dir);
    expect(text).toContain('inside an agentsmesh project');
    expect(text).toContain('`agentsmesh.yaml`');
  });

  it('ignores a stray graph in the home directory, from home or below it', () => {
    // The memory belongs to a repository; a graph under ~ would bind every
    // session under the home directory to one set of rules.
    withLessons({ graph: true, config: true }, fakeHome.dir);
    const plain = join(fakeHome.dir, 'work', 'plain');
    mkdirSync(plain, { recursive: true });
    expect(mcpServerInstructions(fakeHome.dir)).not.toContain('BLOCKING');
    expect(mcpServerInstructions(plain)).not.toContain('BLOCKING');
  });
});
