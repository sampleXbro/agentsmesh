/**
 * `--json` output must survive a pipe. `process.exit` discards whatever is
 * still queued in an async stream, and Node writes to a pipe asynchronously,
 * so a payload larger than the pipe buffer used to reach the consumer as an
 * unparseable fragment. `runCli` spawns with piped stdio, which is exactly the
 * shape that broke.
 */

import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers/run-cli.js';

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'am-json-large-'));
  const rules = join(project, '.agentsmesh/rules');
  await mkdir(rules, { recursive: true });
  await writeFile(
    join(project, 'agentsmesh.yaml'),
    JSON.stringify({
      version: 1,
      targets: ['claude-code', 'cursor', 'codex-cli'],
      features: ['rules'],
    }),
  );
  await writeFile(join(rules, '_root.md'), '---\nroot: true\n---\nRoot rule.\n');
  // Enough rule bodies that the emitted JSON comfortably exceeds a 64 KiB pipe buffer.
  const body = 'Keep the payload honest. '.repeat(40);
  for (let i = 0; i < 120; i++) {
    await writeFile(
      join(rules, `rule-${String(i).padStart(3, '0')}.md`),
      `---\ndescription: Rule ${i}\n---\n${body}\n`,
    );
  }
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

it('emits a complete JSON document through a pipe when the payload is large', async () => {
  const result = await runCli('diff --json', project);

  expect(result.stdout.length).toBeGreaterThan(65_536);
  const parsed = JSON.parse(result.stdout) as { success: boolean; command: string };
  expect(parsed.command).toBe('diff');
  expect(parsed.success).toBe(true);
});

it('keeps the exit code alongside the full payload', async () => {
  const generated = await runCli('generate --json', project);
  expect(generated.exitCode).toBe(0);
  expect(JSON.parse(generated.stdout)).toMatchObject({ success: true });

  const check = await runCli('check --json', project);
  expect(JSON.parse(check.stdout)).toMatchObject({ success: true });
});
