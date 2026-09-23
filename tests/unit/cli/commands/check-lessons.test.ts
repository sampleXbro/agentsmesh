import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../../../../src/cli/commands/check.js';
import { hashContent } from '../../../../src/utils/crypto/hash.js';

let root: string;

/** A project whose lock is in sync, so only the lessons graph can fail the check. */
function inSyncProject(): void {
  writeFileSync(join(root, 'agentsmesh.yaml'), 'version: 1');
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '# Rules');
  writeFileSync(
    join(root, '.agentsmesh', '.lock'),
    `generated_at: "2026-01-01T00:00:00Z"
generated_by: test
lib_version: "0.1.0"
checksums:
  rules/_root.md: "sha256:${hashContent('# Rules')}"
extends: {}
`,
  );
}

function writeGraph(text: string): void {
  mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh', 'lessons', 'lessons.json'), text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-check-lessons-'));
  inSyncProject();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('runCheck — lessons graph', () => {
  it('is unaffected when the project has no lessons graph', async () => {
    const r = await runCheck({}, root);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it('passes with a readable graph', async () => {
    writeGraph('{"version":2,"lessons":{},"topics":{},"triggers":{}}');
    const r = await runCheck({}, root);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it('fails CI on unresolved merge conflict markers, pointing at `lessons resolve`', async () => {
    writeGraph('{\n<<<<<<< HEAD\n  "a": 1\n=======\n  "a": 2\n>>>>>>> other\n}\n');
    const r = await runCheck({}, root);
    expect(r.exitCode).toBe(1);
    expect(r.data.inSync).toBe(true);
    expect(r.error).toContain('merge conflict');
    expect(r.error).toContain('agentsmesh lessons resolve');
  });

  it('fails on a corrupt graph and on a newer schema than this build', async () => {
    writeGraph('{ not json');
    const corrupt = await runCheck({}, root);
    expect(corrupt.exitCode).toBe(1);
    expect(corrupt.error).toContain('could not be parsed');

    writeGraph('{"version":99,"lessons":{},"topics":{},"triggers":{}}');
    const newer = await runCheck({}, root);
    expect(newer.exitCode).toBe(1);
    expect(newer.error).toMatch(/upgrade agentsmesh/i);
  });

  it('keeps the lock result when both the lock and the graph are broken', async () => {
    rmSync(join(root, '.agentsmesh', '.lock'));
    writeGraph('{ not json');
    const r = await runCheck({}, root);
    expect(r.exitCode).toBe(1);
    expect(r.data.hasLock).toBe(false);
    expect(r.error).toContain('lessons.json');
  });
});
