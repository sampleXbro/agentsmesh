/**
 * A `--trigger-file` outside the project is a capture rejection like any other
 * bad trigger: exit code 2 with the reason, not an unhandled error, so an agent
 * sees what to fix and retries with a relative glob.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLessons } from '../../../../src/cli/commands/lessons.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lessons-outside-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('lessons add with a file trigger outside the project', () => {
  it('exits 2 and says the glob must be project-relative', async () => {
    const r = await runLessons(
      { 'trigger-file': '/etc/hosts', topic: 'paths', 'new-topic': true, 'topic-summary': 'Paths' },
      ['add', 'Never edit system files'],
      root,
    );
    expect(r.exitCode).toBe(2);
    expect(r.error ?? '').toMatch(/outside the project root/);
  });
});
