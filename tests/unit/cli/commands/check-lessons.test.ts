import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../../../../src/cli/commands/check.js';
import { hashContent } from '../../../../src/utils/crypto/hash.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../../helpers/lessons-graph-fixture.js';

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
    writeGraphText(root, '{"version":2,"lessons":{},"topics":{},"triggers":{}}');
    const r = await runCheck({}, root);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it('fails CI on unresolved merge conflict markers, pointing at `lessons resolve`', async () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const r = await runCheck({}, root);
    expect(r.exitCode).toBe(1);
    expect(r.data.inSync).toBe(true);
    expect(r.error).toContain('merge conflict');
    expect(r.error).toContain('agentsmesh lessons resolve');
  });

  it('keeps the lock result when both the lock and the graph are broken', async () => {
    rmSync(join(root, '.agentsmesh', '.lock'));
    writeGraphText(root, '{ not json');
    const r = await runCheck({}, root);
    expect(r.exitCode).toBe(1);
    expect(r.data.hasLock).toBe(false);
    expect(r.error).toContain('lessons.json');
  });
});
