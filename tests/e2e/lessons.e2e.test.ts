/**
 * E2E: the recall + capture core of the `agentsmesh lessons` CLI against the
 * real binary — discovery, the add→topics→show→query→journal→validate
 * lifecycle, add validation (incl. transactional rollback), and query
 * validation (incl. fix #2: --format rejects values outside plain|md|json).
 *
 * Lifecycle/admin ops (deprecate/merge/strip-markers/import-md) and the global
 * flag-ordering fix live in lessons-admin.e2e.test.ts.
 *
 * Lesson `add` creates the graph on demand, so cases run in a bare temp dir.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, runCliArgs } from './helpers/run-cli.js';
import { addLessonCli } from './helpers/lessons-cli.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-lessons-cli-e2e-'));
});

afterEach(() => {
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe('lessons CLI — discovery', () => {
  it('--help lists the subcommands and the --format choices', async () => {
    const r = await runCli('lessons --help', dir);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('agentsmesh lessons <subcommand>');
    expect(r.stdout).toContain('--format plain|md|json');
  });

  it('no subcommand prints usage with exit 0', async () => {
    const r = await runCli('lessons', dir);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Usage: agentsmesh lessons <subcommand>');
  });

  it('unknown subcommand exits 2 with a clear message', async () => {
    const r = await runCli('lessons frobnicate', dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('Unknown lessons subcommand: frobnicate');
  });
});

describe('lessons CLI — capture lifecycle', () => {
  it('add (new topic) → topics → show → query → journal → validate', async () => {
    const id = await addLessonCli(dir, 'Run lessons e2e in isolated temp dirs', {
      topic: 'e2e',
      newTopic: true,
      summary: 'E2E discipline',
      extra: ['--trigger-file', 'tests/**', '--trigger-cmd', 'vitest', '--trigger-kw', 'e2ekw'],
    });
    expect(id).toContain('e2e');

    const topics = await runCli('lessons topics', dir);
    expect(topics.exitCode).toBe(0);
    expect(topics.stdout).toContain('e2e');
    expect(topics.stdout).toContain('E2E discipline');

    const show = await runCli('lessons show e2e', dir);
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toContain('Run lessons e2e in isolated temp dirs');

    const byFile = await runCli('lessons query --file tests/foo.test.ts', dir);
    expect(byFile.exitCode).toBe(0);
    expect(byFile.stdout).toContain('Run lessons e2e in isolated temp dirs');

    const byKeyword = await runCli('lessons query --keyword e2ekw', dir);
    expect(byKeyword.stdout).toContain('Run lessons e2e in isolated temp dirs');

    const journal = await runCli('lessons journal', dir);
    expect(journal.exitCode).toBe(0);
    expect(journal.stdout).toContain(id);

    const validate = await runCli('lessons validate', dir);
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).toContain('Lessons graph: ok.');
  });

  it('re-adding the same rule+topic is idempotent (updates, no duplicate)', async () => {
    await addLessonCli(dir, 'Idempotent rule', { topic: 'e2e', newTopic: true, summary: 's' });
    const r = await runCliArgs(
      ['lessons', 'add', 'Idempotent rule', '--topic', 'e2e', '--trigger-kw', 'extra'],
      dir,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Updated lesson');
  });
});

describe('lessons CLI — add validation', () => {
  it('missing rule exits 2', async () => {
    const r = await runCli('lessons add --topic e2e', dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('Missing rule');
  });

  it('missing topic exits 2', async () => {
    const r = await runCliArgs(['lessons', 'add', 'a rule'], dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('Missing --topic');
  });

  it('unknown topic without --new-topic exits 1', async () => {
    const r = await runCliArgs(['lessons', 'add', 'a rule', '--topic', 'nope'], dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Unknown topic: nope');
  });

  it('--new-topic without --topic-summary exits 2 and names the flag', async () => {
    const r = await runCliArgs(['lessons', 'add', 'a rule', '--topic', 'nt', '--new-topic'], dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('needs a one-line summary (--topic-summary on the CLI');
  });

  it('a lone invalid regex trigger is refused as unrecallable and leaves a valid graph', async () => {
    // Seed with a trigger so the surviving graph is genuinely clean (a
    // triggerless lesson would emit a non-fatal UNREACHABLE_LESSON warning).
    await addLessonCli(dir, 'Seed before bad trigger', {
      topic: 'e2e',
      newTopic: true,
      summary: 's',
      extra: ['--trigger-kw', 'seedkw'],
    });
    const bad = await runCliArgs(
      ['lessons', 'add', 'bad regex', '--topic', 'e2e', '--trigger-cmd', '[unclosed'],
      dir,
    );
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain('no effective trigger');
    expect(bad.stderr).toContain('invalid regex');
    const validate = await runCli('lessons validate', dir);
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).toContain('Lessons graph: ok.');
  });
});

describe('lessons CLI — query validation (fix #2: --format)', () => {
  it('rejects --format outside plain|md|json with exit 2', async () => {
    const r = await runCli('lessons query --keyword x --format xml', dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('Invalid --format: expected plain|md|json.');
  });

  it('rejects a --format typo (jso) with exit 2', async () => {
    const r = await runCli('lessons query --keyword x --format jso', dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('Invalid --format');
  });

  it('accepts --format json and emits parseable JSON', async () => {
    await addLessonCli(dir, 'Format json lesson', {
      topic: 'e2e',
      newTopic: true,
      summary: 's',
      extra: ['--trigger-kw', 'fmtkw'],
    });
    const r = await runCli('lessons query --keyword fmtkw --format json', dir);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as { lessons: unknown[]; totalMatches: number };
    expect(parsed.totalMatches).toBe(1);
  });

  it('rejects non-numeric --top with exit 2', async () => {
    const r = await runCli('lessons query --keyword x --top abc', dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('Invalid --top: expected a positive integer.');
  });
});
