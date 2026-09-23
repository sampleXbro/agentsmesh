import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsValidateData } from '../../../../src/cli/commands/lessons-types.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../../helpers/lessons-graph-fixture.js';

let root: string;

async function validate(): Promise<{ exitCode: number; data: LessonsValidateData }> {
  const r = await runLessons({}, ['validate'], root);
  if (r.subcommand !== 'validate') throw new Error(`expected validate, got ${r.subcommand}`);
  return r;
}

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
