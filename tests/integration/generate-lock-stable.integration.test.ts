/**
 * A `generate` that changes nothing leaves `.agentsmesh/.lock` untouched, so
 * the git tree stays clean. Before, every run rewrote `generated_at`, and each
 * teammate's generate showed a lock diff. `check` and `generate --check` must
 * still pass, and a real change must still rewrite the lock.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCheck } from '../../src/cli/commands/check.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { readLock } from '../../src/config/core/lock.js';

let root = '';

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'AgentsMesh Tests',
      GIT_AUTHOR_EMAIL: 'tests@example.com',
      GIT_COMMITTER_NAME: 'AgentsMesh Tests',
      GIT_COMMITTER_EMAIL: 'tests@example.com',
    },
  }).trim();
}

const lockText = (): string => readFileSync(join(root, '.agentsmesh', '.lock'), 'utf-8');
const generate = (flags: Record<string, string | boolean> = {}): ReturnType<typeof runGenerate> =>
  runGenerate(flags, root, { printMatrix: false });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-stable-int-'));
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code, cursor]\nfeatures: [rules]\n',
  );
  writeFileSync(join(root, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
  writeFileSync(join(root, '.gitignore'), '.agentsmeshcache\n');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  git(['init', '-q']);
  await generate();
  git(['add', '-A']);
  git([
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-q',
    '-m',
    'init',
  ]);
  vi.setSystemTime(new Date('2026-02-02T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

describe('generate with nothing changed', () => {
  it('leaves the lock byte-identical and the git tree clean', async () => {
    const before = lockText();

    const result = await generate();

    expect(result.data.files.map((f) => `${f.status} ${f.path}`).sort()).toEqual([
      'unchanged .cursor/AGENTS.md',
      'unchanged .cursor/rules/general.mdc',
      'unchanged AGENTS.md',
      'unchanged CLAUDE.md',
    ]);
    expect(lockText()).toBe(before);
    expect(git(['status', '--porcelain'])).toBe('');
  });

  it('keeps check and generate --check green', async () => {
    await generate();

    expect((await runCheck({}, root)).exitCode).toBe(0);
    expect((await generate({ check: true })).exitCode).toBe(0);
    expect(git(['status', '--porcelain'])).toBe('');
  });
});

describe('generate after a canonical change', () => {
  it('rewrites the lock with the new checksum and time', async () => {
    const before = await readLock(join(root, '.agentsmesh'));
    writeFileSync(
      join(root, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\n# Root 2\n',
    );

    await generate();

    const after = await readLock(join(root, '.agentsmesh'));
    expect(after?.generatedAt).toBe('2026-02-02T00:00:00.000Z');
    expect(after?.checksums['rules/_root.md']).not.toBe(before?.checksums['rules/_root.md']);
    expect((await runCheck({}, root)).exitCode).toBe(0);
  });
});
