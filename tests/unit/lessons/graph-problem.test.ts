import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lessonsGraphProblem } from '../../../src/lessons/graph-problem.js';
import { writeGraphText } from '../../helpers/lessons-graph-fixture.js';

let root: string;
const writeGraph = (text: string): void => writeGraphText(root, text);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-graph-problem-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('lessonsGraphProblem', () => {
  it('is null for a project without lessons and for a readable graph', () => {
    expect(lessonsGraphProblem(root)).toBeNull();
    writeGraph('{"version":2,"lessons":{},"topics":{},"triggers":{}}');
    expect(lessonsGraphProblem(root)).toBeNull();
  });

  it('calls git conflict markers a merge conflict and points at `lessons resolve`', () => {
    writeGraph('{\n<<<<<<< HEAD\n  "a": 1\n=======\n  "a": 2\n>>>>>>> other\n}\n');
    const problem = lessonsGraphProblem(root);
    expect(problem?.kind).toBe('conflict');
    expect(problem?.message).toContain('merge conflict');
    expect(problem?.message).toContain('agentsmesh lessons resolve');
    expect(problem?.message).not.toContain('git checkout');
  });

  it('tells the user to keep a copy before any git checkout of a corrupt graph', () => {
    writeGraph('{ not json');
    const problem = lessonsGraphProblem(root);
    expect(problem?.kind).toBe('corrupt');
    const message = problem?.message ?? '';
    expect(message).toContain('.agentsmesh/lessons/lessons.json');
    expect(message.indexOf('copy')).toBeGreaterThan(-1);
    expect(message.indexOf('copy')).toBeLessThan(message.indexOf('git checkout'));
  });

  it('asks for an upgrade when the graph uses a newer schema', () => {
    writeGraph('{"version":42,"lessons":{},"topics":{},"triggers":{}}');
    const problem = lessonsGraphProblem(root);
    expect(problem?.kind).toBe('newer-version');
    expect(problem?.message).toContain('version 42');
    expect(problem?.message).toMatch(/upgrade agentsmesh/i);
  });
});
