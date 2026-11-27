/**
 * A run that produces nothing, with a target also dropped from `targets:`. The
 * zero-output path used to sweep only the configured targets, so the dropped
 * target's files stayed on disk and the lock's `outputs` map became empty.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { readLock } from '../../../../src/config/core/lock.js';
import { renderGenerate } from '../../../../src/cli/renderers/generate.js';
import { useCapturedOutput } from '../renderers/renderer-test-helpers.js';

const CURSOR = ['.cursor/AGENTS.md', '.cursor/rules/general.mdc', '.cursor/skills/demo/SKILL.md'];

let root = '';
let canonicalDir = '';
let locked: string[] = [];
const output = useCapturedOutput();

function write(rel: string, content: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function configure(targets: string[], features: string[]): void {
  write(
    'agentsmesh.yaml',
    `version: 1\ntargets: [${targets.join(', ')}]\nfeatures: [${features.join(', ')}]\n`,
  );
}

const run = (flags: Record<string, string | boolean>): ReturnType<typeof runGenerate> =>
  runGenerate(flags, root, { printMatrix: false });

const lockedPaths = async (): Promise<string[]> =>
  Object.keys((await readLock(canonicalDir))?.outputs ?? {}).sort();

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'am-empty-removed-'));
  canonicalDir = join(root, '.agentsmesh');
  write('.agentsmesh/rules/_root.md', '---\nroot: true\ndescription: Root\n---\n# Root\n');
  write('.agentsmesh/skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo\n---\n# Demo\n');
  configure(['claude-code', 'cursor'], ['rules', 'skills']);
  await run({});
  locked = await lockedPaths();
  configure(['claude-code'], []);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('generate with nothing to generate and a removed target', () => {
  it('sets up a lock that tracks the files of both targets', () => {
    expect(locked.filter((p) => p.startsWith('.cursor/'))).toEqual(CURSOR);
    expect(locked.length).toBeGreaterThan(CURSOR.length);
  });

  it('removes the files of the removed target and of the configured one, and reports them', async () => {
    const result = await run({});
    renderGenerate(result);

    expect(result.exitCode).toBe(0);
    expect(result.data.files).toEqual([]);
    expect(result.data.removed).toEqual(locked);
    expect(result.data.kept).toBeUndefined();
    for (const path of locked) expect(existsSync(join(root, path))).toBe(false);
    expect(existsSync(join(root, '.cursor'))).toBe(false);
    expect(await lockedPaths()).toEqual([]);
    expect(output.stdout()).toBe(
      [
        'No files to generate (no root rule or rules feature disabled).',
        ...locked.map((p) => `✓ removed ${p}`),
        `Generated: 0 created, 0 updated, ${locked.length} removed, 0 unchanged`,
        '',
      ].join('\n'),
    );
  });

  it('keeps a file of the removed target that was edited, and says so', async () => {
    write('.cursor/rules/general.mdc', 'my own rule\n');

    const result = await run({});

    expect(readFileSync(join(root, '.cursor/rules/general.mdc'), 'utf-8')).toBe('my own rule\n');
    expect(result.data.kept).toEqual([{ path: '.cursor/rules/general.mdc', reason: 'edited' }]);
    expect(result.data.removed).toEqual(locked.filter((p) => p !== '.cursor/rules/general.mdc'));
    expect(await lockedPaths()).toEqual([]);
  });

  it('fails --check, lists the files, never says in sync, and changes nothing', async () => {
    const lock = readFileSync(join(canonicalDir, '.lock'), 'utf-8');

    const result = await run({ check: true });
    renderGenerate(result);

    expect(result.exitCode).toBe(1);
    expect(result.data.mode).toBe('check');
    expect(result.data.removed).toEqual(locked);
    for (const path of locked) expect(existsSync(join(root, path))).toBe(true);
    expect(readFileSync(join(canonicalDir, '.lock'), 'utf-8')).toBe(lock);
    expect(output.stdout()).toBe(
      'No files to generate (no root rule or rules feature disabled).\n',
    );
    expect(output.stderr()).toBe(
      [
        ...locked.map((p) => `✗ [check] stale ${p}`),
        "✗ Generated files are out of sync. Run 'agentsmesh generate' to remove them.",
        '',
      ].join('\n'),
    );
  });

  it('only warns under --check when every file of the removed target was edited', async () => {
    for (const path of locked) rmSync(join(root, path), { force: true });
    for (const path of CURSOR) write(path, 'mine\n');

    const result = await run({ check: true });

    expect(result.exitCode).toBe(0);
    expect(result.data.removed).toBeUndefined();
    expect(result.data.kept).toEqual(CURSOR.map((path) => ({ path, reason: 'edited' })));
  });

  it('lists the removals on --dry-run and changes nothing', async () => {
    const lock = readFileSync(join(canonicalDir, '.lock'), 'utf-8');

    const result = await run({ 'dry-run': true });
    renderGenerate(result);

    expect(result.exitCode).toBe(0);
    expect(result.lockWritten).toBe(false);
    expect(result.data.removed).toEqual(locked);
    for (const path of locked) expect(existsSync(join(root, path))).toBe(true);
    expect(readFileSync(join(canonicalDir, '.lock'), 'utf-8')).toBe(lock);
    expect(output.stdout()).toBe(
      [
        'No files to generate (no root rule or rules feature disabled).',
        ...locked.map((p) => `[dry-run] removed ${p}`),
        '',
      ].join('\n'),
    );
  });

  it('never removes anything on a --targets run', async () => {
    const lock = readFileSync(join(canonicalDir, '.lock'), 'utf-8');

    const result = await run({ targets: 'claude-code' });

    expect(result.exitCode).toBe(0);
    expect(result.data.removed).toBeUndefined();
    for (const path of locked) expect(existsSync(join(root, path))).toBe(true);
    expect(readFileSync(join(canonicalDir, '.lock'), 'utf-8')).toBe(lock);
  });
});
