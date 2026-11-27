/**
 * `agentsmesh merge` must carry the lock's `outputs` map forward.
 *
 * The directory sweep deletes a discovered file only when the previous lock says
 * agentsmesh generated it. `resolveLockConflict` used to write a lock with no
 * `outputs` at all, and a full generate REPLACES the map with only what that run
 * emitted — so a file generated before the merge and no longer emitted after it
 * could never appear in any future map, and was never evicted. Not a one-run
 * deferral: a permanent strand.
 *
 * The map is a pure record of what agentsmesh wrote, so unioning both conflict
 * sides only ever widens the set of paths provably ours. It cannot cause a
 * foreign file to be deleted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const TEST_DIR = join(tmpdir(), 'am-integration-merge-outputs');
const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

function run(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, { cwd: TEST_DIR, encoding: 'utf-8' });
}

function rule(slug: string, body: string): void {
  writeFileSync(
    join(TEST_DIR, '.agentsmesh', 'rules', `${slug}.md`),
    `---\ndescription: "${slug}"\nglobs: ["**/*.ts"]\n---\n${body}\n`,
  );
}

function lockOutputs(): Record<string, string> {
  const raw = parseYaml(readFileSync(join(TEST_DIR, '.agentsmesh', '.lock'), 'utf-8')) as {
    outputs?: Record<string, string>;
  };
  return raw.outputs ?? {};
}

/** Rewrites the lock as a git-conflicted file with both sides' outputs differing. */
function conflictLock(ours: string, theirs: string): void {
  const lockPath = join(TEST_DIR, '.agentsmesh', '.lock');
  const current = readFileSync(lockPath, 'utf-8');
  const [head] = current.split('outputs:');
  writeFileSync(
    lockPath,
    [
      head!.trimEnd(),
      '<<<<<<< HEAD',
      'outputs:',
      `  ${ours}: sha256:aaa`,
      '=======',
      'outputs:',
      `  ${theirs}: sha256:bbb`,
      '>>>>>>> feature',
      '',
    ].join('\n'),
  );
}

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n',
  );
  writeFileSync(
    join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
    '---\nroot: true\ndescription: "Root"\n---\n# Root\n',
  );
});

afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('merge carries the outputs map forward', () => {
  it('still evicts a file generated before the merge', () => {
    rule('doomed', '# Doomed');
    run('generate');

    const generated = join(TEST_DIR, '.claude', 'rules', 'doomed.md');
    expect(existsSync(generated)).toBe(true);
    expect(Object.keys(lockOutputs())).toContain('.claude/rules/doomed.md');

    // A merge lands, then the rule is dropped from canonical.
    conflictLock('.claude/rules/doomed.md', '.claude/rules/doomed.md');
    run('merge');
    rmSync(join(TEST_DIR, '.agentsmesh', 'rules', 'doomed.md'));

    run('generate');

    expect(existsSync(generated)).toBe(false);
  });

  it('keeps the union of both conflict sides', () => {
    rule('doomed', '# Doomed');
    run('generate');

    conflictLock('.claude/rules/ours-only.md', '.claude/rules/theirs-only.md');
    run('merge');

    const outputs = Object.keys(lockOutputs());
    expect(outputs).toContain('.claude/rules/ours-only.md');
    expect(outputs).toContain('.claude/rules/theirs-only.md');
  });

  it('leaves a file agentsmesh never generated alone after a merge', () => {
    run('generate');
    mkdirSync(join(TEST_DIR, '.claude', 'skills'), { recursive: true });
    const foreign = join(TEST_DIR, '.claude', 'skills', 'hand-written.md');
    writeFileSync(foreign, '# mine\n');

    conflictLock('.claude/rules/a.md', '.claude/rules/b.md');
    run('merge');
    run('generate');

    expect(existsSync(foreign)).toBe(true);
  });
});
