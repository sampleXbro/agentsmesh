import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsValidateData } from '../../../../src/cli/commands/lessons-types.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../../helpers/lessons-graph-fixture.js';
import {
  driverDidNotRun,
  isolateGit,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../../helpers/lessons-merge-repo.js';

let root: string;

async function validate(): Promise<{ exitCode: number; data: LessonsValidateData }> {
  const r = await runLessons({}, ['validate'], root);
  if (r.subcommand !== 'validate') throw new Error(`expected validate, got ${r.subcommand}`);
  return r;
}

let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-validate-handler-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('lessons validate — unreadable graph', () => {
  it('reports conflict markers as a merge conflict and recommends `lessons resolve`', async () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const r = await validate();
    expect(r.exitCode).toBe(1);
    expect(r.data.ok).toBe(false);
    expect(r.data.findings).toHaveLength(1);
    expect(r.data.findings[0]!.code).toBe('MERGE_CONFLICT');
    expect(r.data.findings[0]!.message).toContain('agentsmesh lessons resolve');
    expect(r.data.findings[0]!.message).not.toContain('git checkout');
  });

  it('keeps CORRUPT_GRAPH for broken JSON, telling the user to keep a copy first', async () => {
    writeGraphText(root, '{ not json');
    const r = await validate();
    expect(r.exitCode).toBe(1);
    expect(r.data.findings.map((f) => f.code)).toEqual(['CORRUPT_GRAPH']);
    const message = r.data.findings[0]!.message;
    expect(message.indexOf('Keep a copy')).toBeGreaterThan(-1);
    expect(message.indexOf('Keep a copy')).toBeLessThan(message.indexOf('git checkout'));
  });

  it('fails with MERGE_CONFLICT when git still holds a one-sided lessons.json unmerged', async () => {
    mergeLessonsBranches(root, root, TWO_CAPTURES);
    driverDidNotRun(root, root);
    const r = await validate();
    expect(r.exitCode).toBe(1);
    expect(r.data.findings.map((f) => f.code)).toEqual(['MERGE_CONFLICT']);
    expect(r.data.findings[0]!.message).toContain(
      'Run `agentsmesh lessons resolve` BEFORE `git add',
    );
  });

  it('reports a well-formed graph that fails the schema as SCHEMA_INVALID, briefly', async () => {
    writeGraphText(
      root,
      '{"version":2,"lessons":{},"topics":{"Bad Id":{"summary":""}},"triggers":{}}',
    );
    const r = await validate();
    expect(r.exitCode).toBe(1);
    expect(r.data.findings.map((f) => f.code)).toEqual(['SCHEMA_INVALID']);
    const message = r.data.findings[0]!.message;
    expect(message).toContain(
      'does not match the lessons schema (topics.Bad Id: Invalid key in record',
    );
    expect(message).not.toContain('"origin"');
    expect(message.split('\n')).toHaveLength(1);
  });

  it('reports a newer schema version as an upgrade, not corruption', async () => {
    writeGraphText(root, '{"version":9,"lessons":{},"topics":{},"triggers":{}}');
    const r = await validate();
    expect(r.exitCode).toBe(1);
    expect(r.data.findings.map((f) => f.code)).toEqual(['NEWER_GRAPH_VERSION']);
    expect(r.data.findings[0]!.message).toMatch(/upgrade agentsmesh/i);
  });

  it('still validates a readable graph and passes an absent one', async () => {
    expect((await validate()).exitCode).toBe(0);
    writeGraphText(root, '{"version":2,"lessons":{},"topics":{},"triggers":{}}');
    const r = await validate();
    expect(r.exitCode).toBe(0);
    expect(r.data.ok).toBe(true);
  });
});

describe('lessons validate — the failure summary (the --json envelope error)', () => {
  it('names the error codes instead of "Command \'lessons\' failed"', async () => {
    writeGraphText(root, '{bad');
    const r = await runLessons({}, ['validate'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toBe('Lessons graph has 1 error (CORRUPT_GRAPH).');
  });

  it('counts every error and lists each code once', async () => {
    writeGraphText(
      root,
      JSON.stringify({
        version: 2,
        topics: {},
        triggers: {},
        lessons: {
          a: {
            rule: 'A.',
            topics: ['x'],
            triggers: ['t1'],
            evidence: [],
            status: 'active',
            createdAt: '2026-01-01',
          },
        },
      }),
    );
    const r = await runLessons({}, ['validate'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/^Lessons graph has 2 errors \([A-Z_]+, [A-Z_]+\)\.$/);
  });

  it('has no error when the graph is valid', async () => {
    const r = await runLessons({}, ['validate'], root);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
  });
});
